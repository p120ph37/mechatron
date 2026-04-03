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

// ── memory_isValid ──────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool { is_proc_valid(pid) }

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool { win_is_valid(pid) }

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(_pid: i32) -> bool { false }

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
pub fn memory_get_region(env: Env, _pid: i32, _address: f64) -> Result<napi::JsObject> {
    region_to_obj(&env, &RegionInfo::default())
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
pub fn memory_get_regions(env: Env, _pid: i32, _start: Option<f64>, _stop: Option<f64>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
}

// ── memory_setAccess / setAccessFlags ───────────────────────────────────

#[napi(js_name = "memory_setAccess")]
pub fn memory_set_access(_pid: i32, _region_start: f64, _readable: bool, _writable: bool, _executable: bool) -> bool { false }

#[napi(js_name = "memory_setAccessFlags")]
pub fn memory_set_access_flags(_pid: i32, _region_start: f64, _flags: u32) -> bool { false }

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
pub fn memory_get_ptr_size(_pid: i32) -> f64 { 0.0 }

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
pub fn memory_get_min_address(_pid: i32) -> f64 { 0.0 }

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_getMaxAddress")]
pub fn memory_get_max_address(_pid: i32) -> f64 { 0.0 }

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
pub fn memory_get_page_size(_pid: i32) -> f64 { 0.0 }

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
pub fn memory_find(env: Env, _pid: i32, _pattern: String, _start: Option<f64>, _stop: Option<f64>, _limit: Option<f64>, _flags: Option<String>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
}

// ── memory_readData ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, pid: i32, address: f64, length: f64, _flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    let mut buf = vec![0u8; length as usize];
    let read = read_process_memory(pid, address as u64, &mut buf);
    if read > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, pid: i32, address: f64, length: f64, _flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    let mut buf = vec![0u8; length as usize];
    let read = win_read_memory(pid, address as u64, &mut buf);
    if read > 0 { Ok(Either::A(Buffer::from(buf))) } else { Ok(Either::B(env.get_null()?)) }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_readData")]
pub fn memory_read_data(env: Env, _pid: i32, _address: f64, _length: f64, _flags: Option<i32>) -> Result<Either<Buffer, napi::JsNull>> {
    Ok(Either::B(env.get_null()?))
}

// ── memory_writeData ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, _flags: Option<i32>) -> f64 {
    write_process_memory(pid, address as u64, &data) as f64
}

#[cfg(target_os = "windows")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, _flags: Option<i32>) -> f64 {
    win_write_memory(pid, address as u64, &data) as f64
}

#[cfg(target_os = "macos")]
#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(_pid: i32, _address: f64, _data: Buffer, _flags: Option<i32>) -> f64 { 0.0 }

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
