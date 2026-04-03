use napi::bindgen_prelude::*;
use napi_derive::napi;

// ── Shared types (all platforms) ────────────────────────────────────────────

struct RegionInfo {
    valid: bool,
    bound: bool,
    start: u64,
    stop: u64,
    size: u64,
    readable: bool,
    writable: bool,
    executable: bool,
    access: u32,
    private: bool,
    guarded: bool,
}

impl Default for RegionInfo {
    fn default() -> Self {
        Self {
            valid: false, bound: false, start: 0, stop: 0, size: 0,
            readable: false, writable: false, executable: false,
            access: 0, private: false, guarded: false,
        }
    }
}

fn region_to_obj(env: &Env, r: &RegionInfo) -> Result<napi::JsObject> {
    let mut o = env.create_object()?;
    o.set("valid", r.valid)?;
    o.set("bound", r.bound)?;
    o.set("start", r.start as f64)?;
    o.set("stop", r.stop as f64)?;
    o.set("size", r.size as f64)?;
    o.set("readable", r.readable)?;
    o.set("writable", r.writable)?;
    o.set("executable", r.executable)?;
    o.set("access", r.access)?;
    o.set("private", r.private)?;
    o.set("guarded", r.guarded)?;
    Ok(o)
}

// ── Linux internals ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;

#[cfg(target_os = "linux")]
fn is_proc_valid(pid: i32) -> bool {
    pid > 0 && Path::new(&format!("/proc/{}", pid)).exists()
}

#[cfg(target_os = "linux")]
fn parse_maps(pid: i32) -> Vec<RegionInfo> {
    let mut regions = Vec::new();
    let maps_path = format!("/proc/{}/maps", pid);
    let content = match fs::read_to_string(&maps_path) {
        Ok(c) => c,
        Err(_) => return regions,
    };
    for line in content.lines() {
        let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
        if parts.len() < 2 { continue; }
        let addr_parts: Vec<&str> = parts[0].split('-').collect();
        if addr_parts.len() != 2 { continue; }
        let start = u64::from_str_radix(addr_parts[0], 16).unwrap_or(0);
        let stop = u64::from_str_radix(addr_parts[1], 16).unwrap_or(0);
        let perms = parts[1];
        let readable = perms.contains('r');
        let writable = perms.contains('w');
        let executable = perms.contains('x');
        let is_private = perms.contains('p');
        let mut access: u32 = 0;
        if readable { access |= 1; }
        if writable { access |= 2; }
        if executable { access |= 4; }
        regions.push(RegionInfo {
            valid: true, bound: true, start, stop, size: stop - start,
            readable, writable, executable, access, private: is_private, guarded: false,
        });
    }
    regions
}

#[cfg(target_os = "linux")]
fn read_process_memory(pid: i32, address: u64, buf: &mut [u8]) -> usize {
    unsafe {
        let local_iov = libc::iovec { iov_base: buf.as_mut_ptr() as *mut _, iov_len: buf.len() };
        let remote_iov = libc::iovec { iov_base: address as *mut _, iov_len: buf.len() };
        let result = libc::process_vm_readv(pid, &local_iov, 1, &remote_iov, 1, 0);
        if result < 0 { 0 } else { result as usize }
    }
}

#[cfg(target_os = "linux")]
fn write_process_memory(pid: i32, address: u64, buf: &[u8]) -> usize {
    unsafe {
        let local_iov = libc::iovec { iov_base: buf.as_ptr() as *mut _, iov_len: buf.len() };
        let remote_iov = libc::iovec { iov_base: address as *mut _, iov_len: buf.len() };
        let result = libc::process_vm_writev(pid, &local_iov, 1, &remote_iov, 1, 0);
        if result < 0 { 0 } else { result as usize }
    }
}

// ── Windows internals ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Diagnostics::Debug::*;

#[cfg(target_os = "windows")]
fn win_open_proc(pid: i32, access: PROCESS_ACCESS_RIGHTS) -> Option<HANDLE> {
    if pid <= 0 { return None; }
    unsafe { OpenProcess(access, false, pid as u32).ok() }
}

#[cfg(target_os = "windows")]
fn win_is_valid(pid: i32) -> bool {
    if let Some(h) = win_open_proc(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe { let _ = CloseHandle(h); }
        true
    } else {
        false
    }
}

#[cfg(target_os = "windows")]
fn win_protect_to_flags(protect: PAGE_PROTECTION_FLAGS) -> (bool, bool, bool, bool, u32) {
    let p = protect.0;
    let readable = p & (PAGE_READONLY.0 | PAGE_READWRITE.0 | PAGE_EXECUTE_READ.0
        | PAGE_EXECUTE_READWRITE.0 | PAGE_WRITECOPY.0 | PAGE_EXECUTE_WRITECOPY.0) != 0;
    let writable = p & (PAGE_READWRITE.0 | PAGE_EXECUTE_READWRITE.0
        | PAGE_WRITECOPY.0 | PAGE_EXECUTE_WRITECOPY.0) != 0;
    let executable = p & (PAGE_EXECUTE.0 | PAGE_EXECUTE_READ.0
        | PAGE_EXECUTE_READWRITE.0 | PAGE_EXECUTE_WRITECOPY.0) != 0;
    let guarded = p & PAGE_GUARD.0 != 0;
    let mut access: u32 = 0;
    if readable { access |= 1; }
    if writable { access |= 2; }
    if executable { access |= 4; }
    (readable, writable, executable, guarded, access)
}

#[cfg(target_os = "windows")]
fn win_query_regions(pid: i32, start: u64, stop: u64) -> Vec<RegionInfo> {
    let mut regions = Vec::new();
    let h = match win_open_proc(pid, PROCESS_QUERY_INFORMATION) {
        Some(h) => h,
        None => return regions,
    };
    unsafe {
        let mut addr = start as usize;
        loop {
            if addr as u64 >= stop { break; }
            let mut mbi: MEMORY_BASIC_INFORMATION = std::mem::zeroed();
            let ret = VirtualQueryEx(h, Some(addr as *const _), &mut mbi, std::mem::size_of::<MEMORY_BASIC_INFORMATION>());
            if ret == 0 { break; }
            let region_start = mbi.BaseAddress as u64;
            let region_size = mbi.RegionSize as u64;
            let region_end = region_start + region_size;
            if mbi.State == MEM_COMMIT {
                let (readable, writable, executable, guarded, access) = win_protect_to_flags(mbi.Protect);
                regions.push(RegionInfo {
                    valid: true, bound: true,
                    start: region_start, stop: region_end, size: region_size,
                    readable, writable, executable, access,
                    private: mbi.Type == MEM_PRIVATE, guarded,
                });
            }
            addr = region_end as usize;
            if addr <= mbi.BaseAddress as usize { break; }
        }
        let _ = CloseHandle(h);
    }
    regions
}

#[cfg(target_os = "windows")]
fn win_read_memory(pid: i32, address: u64, buf: &mut [u8]) -> usize {
    let h = match win_open_proc(pid, PROCESS_VM_READ) {
        Some(h) => h,
        None => return 0,
    };
    unsafe {
        let mut bytes_read: usize = 0;
        let result = ReadProcessMemory(h, address as *const _, buf.as_mut_ptr() as *mut _, buf.len(), Some(&mut bytes_read));
        let _ = CloseHandle(h);
        if result.is_ok() { bytes_read } else { 0 }
    }
}

#[cfg(target_os = "windows")]
fn win_write_memory(pid: i32, address: u64, buf: &[u8]) -> usize {
    let h = match win_open_proc(pid, PROCESS_VM_WRITE | PROCESS_VM_OPERATION) {
        Some(h) => h,
        None => return 0,
    };
    unsafe {
        let mut bytes_written: usize = 0;
        let result = WriteProcessMemory(h, address as *const _, buf.as_ptr() as *const _, buf.len(), Some(&mut bytes_written));
        let _ = CloseHandle(h);
        if result.is_ok() { bytes_written } else { 0 }
    }
}

// ── macOS internals ─────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
extern "C" {
    fn mach_task_self() -> u32;
    fn task_for_pid(target_tport: u32, pid: i32, t: *mut u32) -> i32;
    fn mach_vm_region(
        target_task: u32, address: *mut u64, size: *mut u64,
        flavor: i32, info: *mut i32, info_cnt: *mut u32,
        object_name: *mut u32,
    ) -> i32;
    fn mach_vm_read_overwrite(
        target_task: u32, address: u64, size: u64,
        data: u64, outsize: *mut u64,
    ) -> i32;
    fn mach_vm_write(
        target_task: u32, address: u64,
        data: u64, data_cnt: u32,
    ) -> i32;
    fn mach_vm_protect(
        target_task: u32, address: u64, size: u64,
        set_maximum: i32, new_protection: i32,
    ) -> i32;
}

#[cfg(target_os = "macos")]
const VM_REGION_BASIC_INFO_64: i32 = 9;
#[cfg(target_os = "macos")]
const VM_REGION_BASIC_INFO_COUNT_64: u32 = 9;

#[cfg(target_os = "macos")]
const VM_PROT_NONE: i32 = 0;
#[cfg(target_os = "macos")]
const VM_PROT_READ: i32 = 1;
#[cfg(target_os = "macos")]
const VM_PROT_WRITE: i32 = 2;
#[cfg(target_os = "macos")]
const VM_PROT_EXECUTE: i32 = 4;

// vm_region_basic_info_64 struct
#[cfg(target_os = "macos")]
#[repr(C)]
struct VmRegionBasicInfo64 {
    protection: i32,
    max_protection: i32,
    inheritance: u32,
    shared: u32,
    reserved: u32,
    offset: u64,
    behavior: i32,
    user_wired_count: u16,
}

// Static VM limits matching C++
#[cfg(target_os = "macos")]
const MAC_MIN_VM: u64 = 0x000000001000;
#[cfg(target_os = "macos")]
const MAC_MAX_VM_64: u64 = 0x7FFFFFFF0000;

#[cfg(target_os = "macos")]
fn mac_get_task(pid: i32) -> u32 {
    if pid <= 0 { return 0; }
    unsafe {
        let mut task: u32 = 0;
        if task_for_pid(mach_task_self(), pid, &mut task) != 0 {
            return 0;
        }
        task
    }
}

#[cfg(target_os = "macos")]
fn mac_is_valid(pid: i32) -> bool {
    if pid <= 0 { return false; }
    unsafe {
        if libc::kill(pid, 0) == 0 { return true; }
        *libc::__error() != libc::ESRCH
    }
}

#[cfg(target_os = "macos")]
fn mac_get_region(task: u32, address: u64) -> RegionInfo {
    let mut region = RegionInfo::default();
    if task == 0 { return region; }

    unsafe {
        let mut base: u64 = address;
        let mut size: u64 = 0;
        let mut info: VmRegionBasicInfo64 = std::mem::zeroed();
        let mut count = VM_REGION_BASIC_INFO_COUNT_64;
        let mut port: u32 = 0;

        if mach_vm_region(
            task, &mut base, &mut size,
            VM_REGION_BASIC_INFO_64,
            &mut info as *mut _ as *mut i32,
            &mut count, &mut port,
        ) != 0 {
            return region;
        }

        let start = base;
        let stop = base + size;

        // Avoid returning invalid regions
        if stop > MAC_MAX_VM_64 { return region; }

        region.start = address;

        if start <= address && address < stop {
            region.bound = true;
            region.stop = stop;
            region.size = stop - address;
            region.access = info.protection as u32;
            region.readable = (info.protection & VM_PROT_READ) != 0;
            region.writable = (info.protection & VM_PROT_WRITE) != 0;
            region.executable = (info.protection & VM_PROT_EXECUTE) != 0;
            region.private = info.shared == 0;
        } else {
            // Region is unbound - gap between address and next region
            region.stop = start;
            region.size = start - address;
        }

        region.valid = true;
    }
    region
}

#[cfg(target_os = "macos")]
fn mac_read_memory(task: u32, address: u64, buf: &mut [u8]) -> usize {
    if task == 0 { return 0; }
    unsafe {
        let mut bytes_read: u64 = 0;
        if mach_vm_read_overwrite(
            task, address, buf.len() as u64,
            buf.as_mut_ptr() as u64, &mut bytes_read,
        ) == 0 {
            bytes_read as usize
        } else {
            0
        }
    }
}

#[cfg(target_os = "macos")]
fn mac_write_memory(task: u32, address: u64, buf: &[u8]) -> usize {
    if task == 0 { return 0; }
    unsafe {
        if mach_vm_write(
            task, address,
            buf.as_ptr() as u64, buf.len() as u32,
        ) == 0 {
            buf.len()
        } else {
            0
        }
    }
}

// ── memory_isValid ──────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool { is_proc_valid(pid) }

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool { win_is_valid(pid) }

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool { mac_is_valid(pid) }

// ── memory_getRegion ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getRegion")]
pub fn memory_get_region(env: Env, pid: i32, address: f64) -> Result<napi::JsObject> {
    let addr = address as u64;
    let regions = parse_maps(pid);
    for r in &regions {
        if addr >= r.start && addr < r.stop { return region_to_obj(&env, r); }
    }
    region_to_obj(&env, &RegionInfo::default())
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getRegion")]
pub fn memory_get_region(env: Env, pid: i32, address: f64) -> Result<napi::JsObject> {
    let h = match win_open_proc(pid, PROCESS_QUERY_INFORMATION) {
        Some(h) => h,
        None => return region_to_obj(&env, &RegionInfo::default()),
    };
    unsafe {
        let mut mbi: MEMORY_BASIC_INFORMATION = std::mem::zeroed();
        let ret = VirtualQueryEx(h, Some(address as u64 as usize as *const _), &mut mbi, std::mem::size_of::<MEMORY_BASIC_INFORMATION>());
        let _ = CloseHandle(h);
        if ret == 0 { return region_to_obj(&env, &RegionInfo::default()); }
        if mbi.State != MEM_COMMIT {
            return region_to_obj(&env, &RegionInfo { valid: true, start: mbi.BaseAddress as u64, stop: mbi.BaseAddress as u64 + mbi.RegionSize as u64, size: mbi.RegionSize as u64, ..Default::default() });
        }
        let (readable, writable, executable, guarded, access) = win_protect_to_flags(mbi.Protect);
        region_to_obj(&env, &RegionInfo {
            valid: true, bound: true,
            start: mbi.BaseAddress as u64, stop: mbi.BaseAddress as u64 + mbi.RegionSize as u64, size: mbi.RegionSize as u64,
            readable, writable, executable, access, private: mbi.Type == MEM_PRIVATE, guarded,
        })
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getRegion")]
pub fn memory_get_region(env: Env, pid: i32, address: f64) -> Result<napi::JsObject> {
    let task = mac_get_task(pid);
    if task == 0 { return region_to_obj(&env, &RegionInfo::default()); }
    let region = mac_get_region(task, address as u64);
    region_to_obj(&env, &region)
}

// ── memory_getRegions ───────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getRegions")]
pub fn memory_get_regions(env: Env, pid: i32, start: Option<f64>, stop: Option<f64>) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let regions = parse_maps(pid);
    let filtered: Vec<&RegionInfo> = regions.iter().filter(|r| r.stop > start_addr && r.start < stop_addr).collect();
    let mut arr = env.create_array(filtered.len() as u32)?;
    for (i, r) in filtered.iter().enumerate() { arr.set(i as u32, region_to_obj(&env, r)?)?; }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getRegions")]
pub fn memory_get_regions(env: Env, pid: i32, start: Option<f64>, stop: Option<f64>) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let regions = win_query_regions(pid, start_addr, stop_addr);
    let mut arr = env.create_array(regions.len() as u32)?;
    for (i, r) in regions.iter().enumerate() { arr.set(i as u32, region_to_obj(&env, r)?)?; }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getRegions")]
pub fn memory_get_regions(env: Env, pid: i32, start: Option<f64>, stop: Option<f64>) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(MAC_MAX_VM_64 as f64) as u64;
    let task = mac_get_task(pid);
    let mut regions = Vec::new();
    if task != 0 {
        let mut addr = start_addr;
        loop {
            if addr >= stop_addr { break; }
            let region = mac_get_region(task, addr);
            if !region.valid { break; }
            regions.push(region);
            addr = regions.last().unwrap().stop;
            if addr == 0 { break; } // overflow protection
        }
    }
    let mut arr = env.create_array(regions.len() as u32)?;
    for (i, r) in regions.iter().enumerate() { arr.set(i as u32, region_to_obj(&env, r)?)?; }
    Ok(arr.coerce_to_object()?)
}

// ── memory_setAccess / setAccessFlags ───────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_setAccess")]
pub fn memory_set_access(_pid: i32, _region_start: f64, _readable: bool, _writable: bool, _executable: bool) -> bool { false }

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_setAccessFlags")]
pub fn memory_set_access_flags(_pid: i32, _region_start: f64, _flags: u32) -> bool { false }

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_setAccess")]
pub fn memory_set_access(pid: i32, region_start: f64, readable: bool, writable: bool, executable: bool) -> bool {
    // Convert bool flags to PAGE_* constants matching C++
    let access: u32 = if executable {
        if writable {
            PAGE_EXECUTE_READWRITE.0
        } else if readable {
            PAGE_EXECUTE_READ.0
        } else {
            PAGE_EXECUTE.0
        }
    } else if writable {
        PAGE_READWRITE.0
    } else if readable {
        PAGE_READONLY.0
    } else {
        PAGE_NOACCESS.0
    };
    memory_set_access_flags(pid, region_start, access)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_setAccessFlags")]
pub fn memory_set_access_flags(pid: i32, region_start: f64, flags: u32) -> bool {
    let h = match win_open_proc(pid, PROCESS_VM_OPERATION) {
        Some(h) => h,
        None => return false,
    };
    // Get region info to know the size
    unsafe {
        let mut mbi: MEMORY_BASIC_INFORMATION = std::mem::zeroed();
        let ret = VirtualQueryEx(h, Some(region_start as u64 as usize as *const _), &mut mbi, std::mem::size_of::<MEMORY_BASIC_INFORMATION>());
        if ret == 0 || mbi.State != MEM_COMMIT {
            let _ = CloseHandle(h);
            return false;
        }
        let mut old_protect: PAGE_PROTECTION_FLAGS = PAGE_PROTECTION_FLAGS(0);
        let result = VirtualProtectEx(
            h,
            mbi.BaseAddress as *const _,
            mbi.RegionSize,
            PAGE_PROTECTION_FLAGS(flags),
            &mut old_protect,
        );
        let _ = CloseHandle(h);
        result.is_ok()
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_setAccess")]
pub fn memory_set_access(pid: i32, region_start: f64, readable: bool, writable: bool, executable: bool) -> bool {
    let mut access = VM_PROT_NONE;
    if readable { access |= VM_PROT_READ; }
    if writable { access |= VM_PROT_WRITE; }
    if executable { access |= VM_PROT_EXECUTE; }
    memory_set_access_flags(pid, region_start, access as u32)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_setAccessFlags")]
pub fn memory_set_access_flags(pid: i32, region_start: f64, flags: u32) -> bool {
    let task = mac_get_task(pid);
    if task == 0 { return false; }
    let region = mac_get_region(task, region_start as u64);
    if !region.valid || !region.bound { return false; }
    unsafe {
        mach_vm_protect(task, region.start, region.size, 0, flags as i32) == 0
    }
}

// ── memory_getPtrSize ───────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getPtrSize")]
pub fn memory_get_ptr_size(pid: i32) -> f64 {
    if !is_proc_valid(pid) { return 0.0; }
    let exe_path = format!("/proc/{}/exe", pid);
    if let Ok(data) = fs::read(&exe_path) { if data.len() > 4 { return if data[4] == 2 { 8.0 } else { 4.0 }; } }
    std::mem::size_of::<usize>() as f64
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getPtrSize")]
pub fn memory_get_ptr_size(pid: i32) -> f64 {
    if let Some(h) = win_open_proc(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe {
            let mut wow64: BOOL = BOOL(0);
            if IsWow64Process(h, &mut wow64).is_ok() {
                let _ = CloseHandle(h);
                return if wow64.as_bool() { 4.0 } else { 8.0 };
            }
            let _ = CloseHandle(h);
        }
    }
    std::mem::size_of::<usize>() as f64
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getPtrSize")]
pub fn memory_get_ptr_size(pid: i32) -> f64 {
    // Match C++: Proc.Is64Bit() ? 8 : 4
    // We use proc_pidinfo to check
    if pid <= 0 { return 0.0; }
    unsafe {
        #[repr(C)]
        struct ProcBsdShortInfo {
            _data: [u8; 48],
            pbsi_flags: u32,
            _pad: [u8; 180],
        }
        extern "C" {
            fn proc_pidinfo(pid: i32, flavor: i32, arg: u64, buffer: *mut libc::c_void, buffersize: i32) -> i32;
        }
        let mut info: ProcBsdShortInfo = std::mem::zeroed();
        let ret = proc_pidinfo(pid, 13 /* PROC_PIDT_SHORTBSDINFO */, 0, &mut info as *mut _ as *mut libc::c_void, 232);
        if ret > 0 {
            if (info.pbsi_flags & 0x04) != 0 { 8.0 } else { 4.0 }
        } else {
            // Default to pointer size of current process
            std::mem::size_of::<usize>() as f64
        }
    }
}

// ── memory_getMinAddress / getMaxAddress ─────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getMinAddress")]
pub fn memory_get_min_address(pid: i32) -> f64 { parse_maps(pid).first().map(|r| r.start as f64).unwrap_or(0.0) }

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getMaxAddress")]
pub fn memory_get_max_address(pid: i32) -> f64 { parse_maps(pid).last().map(|r| r.stop as f64).unwrap_or(0.0) }

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getMinAddress")]
pub fn memory_get_min_address(_pid: i32) -> f64 {
    unsafe {
        let mut info: windows::Win32::System::SystemInformation::SYSTEM_INFO = std::mem::zeroed();
        windows::Win32::System::SystemInformation::GetSystemInfo(&mut info);
        info.lpMinimumApplicationAddress as u64 as f64
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getMaxAddress")]
pub fn memory_get_max_address(_pid: i32) -> f64 {
    unsafe {
        let mut info: windows::Win32::System::SystemInformation::SYSTEM_INFO = std::mem::zeroed();
        windows::Win32::System::SystemInformation::GetSystemInfo(&mut info);
        info.lpMaximumApplicationAddress as u64 as f64
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getMinAddress")]
pub fn memory_get_min_address(_pid: i32) -> f64 { MAC_MIN_VM as f64 }

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getMaxAddress")]
pub fn memory_get_max_address(_pid: i32) -> f64 {
    // C++: Is64Bit ? gMaxVM_64 : gMaxVM_32
    // For simplicity, return 64-bit max (modern macOS is always 64-bit)
    MAC_MAX_VM_64 as f64
}

// ── memory_getPageSize ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_getPageSize")]
pub fn memory_get_page_size(_pid: i32) -> f64 { unsafe { libc::sysconf(libc::_SC_PAGESIZE) as f64 } }

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_getPageSize")]
pub fn memory_get_page_size(_pid: i32) -> f64 {
    unsafe {
        let mut info: windows::Win32::System::SystemInformation::SYSTEM_INFO = std::mem::zeroed();
        windows::Win32::System::SystemInformation::GetSystemInfo(&mut info);
        info.dwPageSize as f64
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getPageSize")]
pub fn memory_get_page_size(_pid: i32) -> f64 {
    unsafe { libc::sysconf(libc::_SC_PAGESIZE) as f64 }
}

// ── memory_find ─────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_find")]
pub fn memory_find(
    env: Env, pid: i32, pattern: String,
    start: Option<f64>, stop: Option<f64>,
    limit: Option<f64>, _flags: Option<String>,
) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let max_results = if limit.unwrap_or(0.0) > 0.0 { limit.unwrap() as usize } else { usize::MAX };
    let regions = parse_maps(pid);
    let mut addresses = Vec::new();
    let pattern_bytes: Vec<Option<u8>> = pattern.split_whitespace()
        .filter_map(|s| { if s == "??" || s == "?" { Some(None) } else { u8::from_str_radix(s, 16).ok().map(Some) } }).collect();
    if pattern_bytes.is_empty() { return Ok(env.create_array(0)?.coerce_to_object()?); }
    for region in &regions {
        if !region.readable || region.stop <= start_addr || region.start >= stop_addr { continue; }
        if addresses.len() >= max_results { break; }
        let read_start = region.start.max(start_addr);
        let read_end = region.stop.min(stop_addr);
        let read_size = (read_end - read_start) as usize;
        if read_size == 0 || read_size > 256 * 1024 * 1024 { continue; }
        let mut buf = vec![0u8; read_size];
        let bytes_read = read_process_memory(pid, read_start, &mut buf);
        if bytes_read == 0 { continue; }
        let buf = &buf[..bytes_read];
        if pattern_bytes.len() > buf.len() { continue; }
        for i in 0..=(buf.len() - pattern_bytes.len()) {
            if addresses.len() >= max_results { break; }
            let mut matched = true;
            for (j, &pb) in pattern_bytes.iter().enumerate() {
                if let Some(expected) = pb { if buf[i + j] != expected { matched = false; break; } }
            }
            if matched { addresses.push((read_start + i as u64) as f64); }
        }
    }
    let mut arr = env.create_array(addresses.len() as u32)?;
    for (i, &addr) in addresses.iter().enumerate() { arr.set(i as u32, addr)?; }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_find")]
pub fn memory_find(
    env: Env, pid: i32, pattern: String,
    start: Option<f64>, stop: Option<f64>,
    limit: Option<f64>, _flags: Option<String>,
) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let max_results = if limit.unwrap_or(0.0) > 0.0 { limit.unwrap() as usize } else { usize::MAX };
    let regions = win_query_regions(pid, start_addr, stop_addr);
    let mut addresses = Vec::new();
    let pattern_bytes: Vec<Option<u8>> = pattern.split_whitespace()
        .filter_map(|s| { if s == "??" || s == "?" { Some(None) } else { u8::from_str_radix(s, 16).ok().map(Some) } }).collect();
    if pattern_bytes.is_empty() { return Ok(env.create_array(0)?.coerce_to_object()?); }
    for region in &regions {
        if !region.readable || region.stop <= start_addr || region.start >= stop_addr { continue; }
        if addresses.len() >= max_results { break; }
        let read_start = region.start.max(start_addr);
        let read_end = region.stop.min(stop_addr);
        let read_size = (read_end - read_start) as usize;
        if read_size == 0 || read_size > 256 * 1024 * 1024 { continue; }
        let mut buf = vec![0u8; read_size];
        let bytes_read = win_read_memory(pid, read_start, &mut buf);
        if bytes_read == 0 { continue; }
        let buf = &buf[..bytes_read];
        if pattern_bytes.len() > buf.len() { continue; }
        for i in 0..=(buf.len() - pattern_bytes.len()) {
            if addresses.len() >= max_results { break; }
            let mut matched = true;
            for (j, &pb) in pattern_bytes.iter().enumerate() {
                if let Some(expected) = pb { if buf[i + j] != expected { matched = false; break; } }
            }
            if matched { addresses.push((read_start + i as u64) as f64); }
        }
    }
    let mut arr = env.create_array(addresses.len() as u32)?;
    for (i, &addr) in addresses.iter().enumerate() { arr.set(i as u32, addr)?; }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_find")]
pub fn memory_find(
    env: Env, pid: i32, pattern: String,
    start: Option<f64>, stop: Option<f64>,
    limit: Option<f64>, _flags: Option<String>,
) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(MAC_MAX_VM_64 as f64) as u64;
    let max_results = if limit.unwrap_or(0.0) > 0.0 { limit.unwrap() as usize } else { usize::MAX };
    let task = mac_get_task(pid);
    let mut addresses = Vec::new();
    let pattern_bytes: Vec<Option<u8>> = pattern.split_whitespace()
        .filter_map(|s| { if s == "??" || s == "?" { Some(None) } else { u8::from_str_radix(s, 16).ok().map(Some) } }).collect();
    if pattern_bytes.is_empty() || task == 0 { return Ok(env.create_array(0)?.coerce_to_object()?); }

    // Iterate regions
    let mut addr = start_addr;
    loop {
        if addr >= stop_addr || addresses.len() >= max_results { break; }
        let region = mac_get_region(task, addr);
        if !region.valid { break; }
        if region.bound && region.readable && region.stop > start_addr && region.start < stop_addr {
            let read_start = region.start.max(start_addr);
            let read_end = region.stop.min(stop_addr);
            let read_size = (read_end - read_start) as usize;
            if read_size > 0 && read_size <= 256 * 1024 * 1024 {
                let mut buf = vec![0u8; read_size];
                let bytes_read = mac_read_memory(task, read_start, &mut buf);
                if bytes_read > 0 {
                    let buf = &buf[..bytes_read];
                    if pattern_bytes.len() <= buf.len() {
                        for i in 0..=(buf.len() - pattern_bytes.len()) {
                            if addresses.len() >= max_results { break; }
                            let mut matched = true;
                            for (j, &pb) in pattern_bytes.iter().enumerate() {
                                if let Some(expected) = pb { if buf[i + j] != expected { matched = false; break; } }
                            }
                            if matched { addresses.push((read_start + i as u64) as f64); }
                        }
                    }
                }
            }
        }
        addr = region.stop;
        if addr == 0 { break; }
    }

    let mut arr = env.create_array(addresses.len() as u32)?;
    for (i, &a) in addresses.iter().enumerate() { arr.set(i as u32, a)?; }
    Ok(arr.coerce_to_object()?)
}

// ── Flags constants ────────────────────────────────────────────────────

#[allow(dead_code)]
const FLAG_DEFAULT: i32 = 0;
#[allow(dead_code)]
const FLAG_SKIP_ERRORS: i32 = 1;
#[allow(dead_code)]
const FLAG_AUTO_ACCESS: i32 = 2;

// ── memory_readData ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, pid: i32, address: f64, length: f64, flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    let addr = address as u64;
    let len = length as usize;
    let f = flags.unwrap_or(FLAG_DEFAULT);

    if f == FLAG_DEFAULT {
        let mut buf = vec![0u8; len];
        let read = read_process_memory(pid, addr, &mut buf);
        return if read > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) };
    }

    // SkipErrors or AutoAccess: iterate region by region
    let mut buf = vec![0u8; len];
    let stop = addr + len as u64;
    let regions = parse_maps(pid);
    let mut bytes: usize = 0;
    let mut region_idx = 0;
    let mut a = addr;

    while a < stop && region_idx < regions.len() {
        // Find region containing address a
        while region_idx < regions.len() && regions[region_idx].stop <= a { region_idx += 1; }
        if region_idx >= regions.len() { break; }
        let region = &regions[region_idx];
        if region.start > a {
            // Gap: fill with zeros (already zeroed), advance to region start
            let gap_end = region.start.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
            continue;
        }

        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        let readable = region.readable;

        // AutoAccess: no protection change available on Linux
        if readable {
            let _ = read_process_memory(pid, a, &mut buf[offset..offset + region_len]);
        }
        // else: already zeroed

        bytes += region_len;
        a = region.stop.min(stop);
        region_idx += 1;
    }
    // Fill remaining gap
    bytes += (stop.saturating_sub(a)) as usize;

    if bytes > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, pid: i32, address: f64, length: f64, flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    let addr = address as u64;
    let len = length as usize;
    let f = flags.unwrap_or(FLAG_DEFAULT);

    if f == FLAG_DEFAULT {
        let mut buf = vec![0u8; len];
        let read = win_read_memory(pid, addr, &mut buf);
        return if read > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) };
    }

    // SkipErrors or AutoAccess: iterate region by region
    let mut buf = vec![0u8; len];
    let stop = addr + len as u64;
    let regions = win_query_regions(pid, addr, stop);
    let mut bytes: usize = 0;
    let mut a = addr;

    for region in &regions {
        if a >= stop { break; }
        // Fill gap before this region
        if region.start > a {
            let gap_end = region.start.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
        }
        if a >= stop { break; }

        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        let mut readable = region.readable;

        // AutoAccess: temporarily make readable
        if !readable && f == FLAG_AUTO_ACCESS {
            let h = win_open_proc(pid, PROCESS_VM_OPERATION);
            if let Some(h) = h {
                unsafe {
                    let mut old = PAGE_PROTECTION_FLAGS(0);
                    if VirtualProtectEx(h, a as usize as *const _, region_len, PAGE_READONLY, &mut old).is_ok() {
                        readable = true;
                        let _ = win_read_memory(pid, a, &mut buf[offset..offset + region_len]);
                        let _ = VirtualProtectEx(h, a as usize as *const _, region_len, old, &mut old);
                    }
                    let _ = CloseHandle(h);
                }
            }
        }

        if readable && f != FLAG_AUTO_ACCESS {
            let _ = win_read_memory(pid, a, &mut buf[offset..offset + region_len]);
        }
        // For AutoAccess with readable regions, just read normally
        if readable && f == FLAG_AUTO_ACCESS && region.readable {
            let _ = win_read_memory(pid, a, &mut buf[offset..offset + region_len]);
        }
        // else: already zeroed for SkipErrors

        bytes += region_len;
        a = region.stop.min(stop);
    }
    bytes += (stop.saturating_sub(a)) as usize;

    if bytes > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, pid: i32, address: f64, length: f64, flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    let task = mac_get_task(pid);
    if task == 0 { return Ok(Either::B(env.get_null()?)); }

    let addr = address as u64;
    let len = length as usize;
    let f = flags.unwrap_or(FLAG_DEFAULT);

    if f == FLAG_DEFAULT {
        let mut buf = vec![0u8; len];
        let read = mac_read_memory(task, addr, &mut buf);
        return if read > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) };
    }

    // SkipErrors or AutoAccess: iterate region by region
    let mut buf = vec![0u8; len];
    let stop = addr + len as u64;
    let mut bytes: usize = 0;
    let mut a = addr;

    loop {
        if a >= stop { break; }
        let region = mac_get_region(task, a);
        if !region.valid { break; }

        if !region.bound {
            // Gap: fill with zeros, advance
            let gap_end = region.stop.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
            continue;
        }

        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        let mut readable = region.readable;

        // AutoAccess: temporarily make readable via mach_vm_protect
        if !readable && f == FLAG_AUTO_ACCESS {
            unsafe {
                if mach_vm_protect(task, region.start, region.size, 0, VM_PROT_READ) == 0 {
                    readable = true;
                    let _ = mac_read_memory(task, a, &mut buf[offset..offset + region_len]);
                    // Restore original access
                    let _ = mach_vm_protect(task, region.start, region.size, 0, region.access as i32);
                }
            }
        }

        if readable && !(f == FLAG_AUTO_ACCESS && !region.readable) {
            let _ = mac_read_memory(task, a, &mut buf[offset..offset + region_len]);
        }
        // else: already zeroed for SkipErrors

        bytes += region_len;
        a = region.stop.min(stop);
        if a == 0 { break; }
    }
    bytes += (stop.saturating_sub(a)) as usize;

    if bytes > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) }
}

// ── memory_writeData ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, flags: Option<i32>) -> f64 {
    let f = flags.unwrap_or(FLAG_DEFAULT);
    if f == FLAG_DEFAULT {
        return write_process_memory(pid, address as u64, &data) as f64;
    }

    // SkipErrors or AutoAccess: iterate region by region
    let addr = address as u64;
    let len = data.len();
    let stop = addr + len as u64;
    let regions = parse_maps(pid);
    let mut bytes: usize = 0;
    let mut a = addr;

    for region in &regions {
        if a >= stop { break; }
        if region.stop <= a { continue; }
        if region.start > a {
            let gap_end = region.start.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
        }
        if a >= stop { break; }
        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        // Linux: no SetAccess available, just write if writable
        if region.writable {
            let _ = write_process_memory(pid, a, &data[offset..offset + region_len]);
        }
        bytes += region_len;
        a = region.stop.min(stop);
    }
    bytes += (stop.saturating_sub(a)) as usize;
    bytes as f64
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, flags: Option<i32>) -> f64 {
    let f = flags.unwrap_or(FLAG_DEFAULT);
    if f == FLAG_DEFAULT {
        return win_write_memory(pid, address as u64, &data) as f64;
    }

    let addr = address as u64;
    let len = data.len();
    let stop = addr + len as u64;
    let regions = win_query_regions(pid, addr, stop);
    let mut bytes: usize = 0;
    let mut a = addr;

    for region in &regions {
        if a >= stop { break; }
        if region.start > a {
            let gap_end = region.start.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
        }
        if a >= stop { break; }
        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        let mut writable = region.writable;

        if !writable && f == FLAG_AUTO_ACCESS {
            let h = win_open_proc(pid, PROCESS_VM_OPERATION);
            if let Some(h) = h {
                unsafe {
                    let mut old = PAGE_PROTECTION_FLAGS(0);
                    if VirtualProtectEx(h, a as usize as *const _, region_len, PAGE_READWRITE, &mut old).is_ok() {
                        writable = true;
                        let _ = win_write_memory(pid, a, &data[offset..offset + region_len]);
                        let _ = VirtualProtectEx(h, a as usize as *const _, region_len, old, &mut old);
                    }
                    let _ = CloseHandle(h);
                }
            }
        }

        if writable && !(f == FLAG_AUTO_ACCESS && !region.writable) {
            let _ = win_write_memory(pid, a, &data[offset..offset + region_len]);
        }

        bytes += region_len;
        a = region.stop.min(stop);
    }
    bytes += (stop.saturating_sub(a)) as usize;
    bytes as f64
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, flags: Option<i32>) -> f64 {
    let task = mac_get_task(pid);
    if task == 0 { return 0.0; }
    let f = flags.unwrap_or(FLAG_DEFAULT);

    if f == FLAG_DEFAULT {
        return mac_write_memory(task, address as u64, &data) as f64;
    }

    let addr = address as u64;
    let len = data.len();
    let stop = addr + len as u64;
    let mut bytes: usize = 0;
    let mut a = addr;

    loop {
        if a >= stop { break; }
        let region = mac_get_region(task, a);
        if !region.valid { break; }

        if !region.bound {
            let gap_end = region.stop.min(stop);
            bytes += (gap_end - a) as usize;
            a = gap_end;
            continue;
        }

        let region_len = (region.stop.min(stop) - a) as usize;
        let offset = (a - addr) as usize;
        let mut writable = region.writable;

        if !writable && f == FLAG_AUTO_ACCESS {
            unsafe {
                let new_prot = VM_PROT_READ | VM_PROT_WRITE | if region.executable { VM_PROT_EXECUTE } else { 0 };
                if mach_vm_protect(task, region.start, region.size, 0, new_prot) == 0 {
                    writable = true;
                    let _ = mac_write_memory(task, a, &data[offset..offset + region_len]);
                    let _ = mach_vm_protect(task, region.start, region.size, 0, region.access as i32);
                }
            }
        }

        if writable && !(f == FLAG_AUTO_ACCESS && !region.writable) {
            let _ = mac_write_memory(task, a, &data[offset..offset + region_len]);
        }

        bytes += region_len;
        a = region.stop.min(stop);
        if a == 0 { break; }
    }
    bytes += (stop.saturating_sub(a)) as usize;
    bytes as f64
}

// ── Cache operations (stubs on all platforms) ───────────────────────────

#[napi(js_name = "memory_createCache")]
pub fn memory_create_cache(_pid: i32, _address: f64, _size: f64, _block_size: f64, _max_blocks: Option<f64>, _flags: Option<f64>) -> bool { false }

#[napi(js_name = "memory_clearCache")]
pub fn memory_clear_cache(_pid: i32) {}

#[napi(js_name = "memory_deleteCache")]
pub fn memory_delete_cache(_pid: i32) {}

#[napi(js_name = "memory_isCaching")]
pub fn memory_is_caching(_pid: i32) -> bool { false }

#[napi(js_name = "memory_getCacheSize")]
pub fn memory_get_cache_size(_pid: i32) -> f64 { 0.0 }
