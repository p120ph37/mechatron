use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;

#[cfg(target_os = "linux")]
use crate::x11::*;

// ── Linux internals ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
struct ProcInfo {
    name: String,
    path: String,
    is_64bit: bool,
}

#[cfg(target_os = "linux")]
fn proc_open(pid: i32) -> Option<ProcInfo> {
    if pid <= 0 { return None; }

    let proc_dir = format!("/proc/{}", pid);
    if !Path::new(&proc_dir).exists() { return None; }

    let exe_link = format!("/proc/{}/exe", pid);
    let mut path = String::new();
    let mut name = String::new();
    let mut is_64bit = cfg!(target_pointer_width = "64");

    if let Ok(target) = std::fs::read_link(&exe_link) {
        path = target.to_string_lossy().to_string();
        if let Some(fname) = target.file_name() {
            name = fname.to_string_lossy().to_string();
        }
    }

    if let Ok(data) = std::fs::read(&exe_link) {
        if data.len() > 4 {
            is_64bit = data[4] == 2;
        }
    }

    Some(ProcInfo { name, path, is_64bit })
}

#[cfg(target_os = "linux")]
fn proc_has_exited(pid: i32) -> bool {
    if pid <= 0 { return true; }
    !Path::new(&format!("/proc/{}", pid)).exists()
}

// ── macOS internals ─────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
extern "C" {
    fn proc_pidpath(pid: i32, buffer: *mut u8, buffersize: u32) -> i32;
    fn proc_listallpids(buffer: *mut libc::c_void, buffersize: i32) -> i32;
    fn proc_name(pid: i32, buffer: *mut u8, buffersize: u32) -> i32;
}

// Mach API declarations
#[cfg(target_os = "macos")]
extern "C" {
    fn mach_task_self() -> u32;
    fn task_for_pid(target_tport: u32, pid: i32, t: *mut u32) -> i32;
    fn task_info(
        target_task: u32, flavor: u32,
        task_info_out: *mut i32, task_info_count: *mut u32,
    ) -> i32;
    fn task_get_exception_ports(
        task: u32, exception_mask: u32,
        masks: *mut u32, masks_cnt: *mut u32,
        old_handlers: *mut u32, old_behaviors: *mut u32,
        old_flavors: *mut u32,
    ) -> i32;
    fn mach_vm_read_overwrite(
        target_task: u32, address: u64, size: u64,
        data: u64, outsize: *mut u64,
    ) -> i32;
}

// Exception mask constants
#[cfg(target_os = "macos")]
const EXC_TYPES_COUNT: usize = 14;
#[cfg(target_os = "macos")]
const EXC_MASK_ALL: u32 = 0x0000FFFE;
#[cfg(target_os = "macos")]
const EXC_MASK_RESOURCE: u32 = 0x00002000;
#[cfg(target_os = "macos")]
const EXC_MASK_GUARD: u32 = 0x00004000;
#[cfg(target_os = "macos")]
const MACH_PORT_NULL: u32 = 0;

// task_info constants
#[cfg(target_os = "macos")]
const TASK_DYLD_INFO: u32 = 17;
#[cfg(target_os = "macos")]
const TASK_DYLD_INFO_COUNT: u32 = 6; // sizeof(task_dyld_info) / sizeof(natural_t) — 24/4 on 64-bit (u64 alignment padding)

// task_dyld_info struct
#[cfg(target_os = "macos")]
#[repr(C)]
struct TaskDyldInfo {
    all_image_info_addr: u64,
    all_image_info_size: u64,
    all_image_info_format: i32,
}

// dyld_all_image_infos (simplified)
#[cfg(target_os = "macos")]
#[repr(C)]
struct AllImageInfo {
    version: u32,
    count: u32,
    array: u64, // pointer to ImageInfo64 array (on 64-bit)
    _pad: [u8; 512], // enough padding for the full struct
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct ImageInfo64 {
    addr: u64,
    path: u64,
    date: u64,
}

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
fn mac_process_exists(pid: i32) -> bool {
    if pid <= 0 { return false; }
    unsafe {
        // Match C++: kill(pid, 0) == 0 || errno != ESRCH
        if libc::kill(pid, 0) == 0 {
            return true;
        }
        *libc::__error() != libc::ESRCH
    }
}

#[cfg(target_os = "macos")]
fn mac_get_path(pid: i32) -> String {
    if pid <= 0 { return String::new(); }
    let mut buf = vec![0u8; libc::PATH_MAX as usize];
    unsafe {
        let len = proc_pidpath(pid, buf.as_mut_ptr(), buf.len() as u32);
        if len > 0 {
            String::from_utf8_lossy(&buf[..len as usize]).to_string()
        } else {
            String::new()
        }
    }
}

#[cfg(target_os = "macos")]
fn mac_get_name(pid: i32) -> String {
    if pid <= 0 { return String::new(); }
    let mut buf = vec![0u8; 256];
    unsafe {
        let len = proc_name(pid, buf.as_mut_ptr(), buf.len() as u32);
        if len > 0 {
            String::from_utf8_lossy(&buf[..len as usize]).to_string()
        } else {
            // Fallback to basename of path
            let path = mac_get_path(pid);
            if path.is_empty() { return String::new(); }
            path.rsplit('/').next().unwrap_or("").to_string()
        }
    }
}

#[cfg(target_os = "macos")]
fn mac_is_64_bit(_pid: i32) -> bool {
    // macOS dropped 32-bit process support in Catalina (10.15).
    // All processes on modern macOS are LP64.  The kernel no longer
    // reliably sets P_LP64 in pbsi_flags on arm64, so checking
    // proc_pidinfo is not useful.
    true
}

#[cfg(target_os = "macos")]
fn mac_is_debugged(pid: i32) -> bool {
    let task = mac_get_task(pid);
    if task == 0 { return false; }
    unsafe {
        let mut masks = [0u32; EXC_TYPES_COUNT];
        let mut ports = [0u32; EXC_TYPES_COUNT];
        let mut behaviors = [0u32; EXC_TYPES_COUNT];
        let mut flavors = [0u32; EXC_TYPES_COUNT];
        let mut count: u32 = 0;

        let exc_mask = EXC_MASK_ALL & !(EXC_MASK_RESOURCE | EXC_MASK_GUARD);

        if task_get_exception_ports(
            task, exc_mask,
            masks.as_mut_ptr(), &mut count,
            ports.as_mut_ptr(), behaviors.as_mut_ptr(),
            flavors.as_mut_ptr(),
        ) == 0 {
            for i in 0..count as usize {
                // MACH_PORT_VALID: port != MACH_PORT_NULL && port != MACH_PORT_DEAD
                if ports[i] != MACH_PORT_NULL && ports[i] != 0xFFFFFFFF {
                    return true;
                }
            }
        }
        false
    }
}

// ── Windows internals ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::ProcessStatus::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Diagnostics::Debug::CheckRemoteDebuggerPresent;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
};

#[cfg(target_os = "windows")]
fn win_open_process(pid: i32, access: PROCESS_ACCESS_RIGHTS) -> Option<HANDLE> {
    if pid <= 0 { return None; }
    unsafe {
        OpenProcess(access, false, pid as u32).ok()
    }
}

#[cfg(target_os = "windows")]
fn win_is_valid(pid: i32) -> bool {
    if pid <= 0 { return false; }
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe { let _ = CloseHandle(h); }
        true
    } else {
        false
    }
}

#[cfg(target_os = "windows")]
fn win_get_path(pid: i32) -> String {
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe {
            let mut buf = [0u16; 1024];
            let mut size = buf.len() as u32;
            if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut size).is_ok() {
                let _ = CloseHandle(h);
                return String::from_utf16_lossy(&buf[..size as usize]).replace('\\', "/");
            }
            let _ = CloseHandle(h);
        }
    }
    String::new()
}

#[cfg(target_os = "windows")]
fn win_get_name(pid: i32) -> String {
    let path = win_get_path(pid);
    if path.is_empty() { return String::new(); }
    path.rsplit('/').next().unwrap_or("").to_string()
}

#[cfg(target_os = "windows")]
fn win_has_exited(pid: i32) -> bool {
    if pid <= 0 { return true; }
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe {
            let mut exit_code: u32 = 0;
            let result = GetExitCodeProcess(h, &mut exit_code);
            let _ = CloseHandle(h);
            if result.is_ok() {
                // STILL_ACTIVE = 259
                return exit_code != 259;
            }
        }
    }
    true
}

// ── process_open ────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_open")]
pub fn process_open(pid: i32) -> bool {
    proc_open(pid).is_some()
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_open")]
pub fn process_open(pid: i32) -> bool {
    if pid <= 0 { return false; }
    let access = PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_QUERY_INFORMATION | PROCESS_VM_WRITE | PROCESS_TERMINATE;
    if let Some(h) = win_open_process(pid, access) {
        unsafe { let _ = CloseHandle(h); }
        true
    } else {
        false
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_open")]
pub fn process_open(pid: i32) -> bool {
    mac_process_exists(pid)
}

// ── process_close ───────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_close")]
pub fn process_close(_pid: i32) {}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "process_close")]
pub fn process_close(_pid: i32) {}

// ── process_isValid ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_isValid")]
pub fn process_is_valid(pid: i32) -> bool {
    proc_open(pid).is_some()
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_isValid")]
pub fn process_is_valid(pid: i32) -> bool {
    win_is_valid(pid)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_isValid")]
pub fn process_is_valid(pid: i32) -> bool {
    mac_process_exists(pid)
}

// ── process_is64Bit ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_is64Bit")]
pub fn process_is_64_bit(pid: i32) -> bool {
    proc_open(pid).map(|p| p.is_64bit).unwrap_or(false)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_is64Bit")]
pub fn process_is_64_bit(pid: i32) -> bool {
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        unsafe {
            let mut wow64: BOOL = BOOL(0);
            let result = IsWow64Process(h, &mut wow64);
            let _ = CloseHandle(h);
            if result.is_ok() {
                // If WOW64 is true, the process is 32-bit on a 64-bit system
                return !wow64.as_bool();
            }
        }
    }
    cfg!(target_pointer_width = "64")
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_is64Bit")]
pub fn process_is_64_bit(pid: i32) -> bool {
    mac_is_64_bit(pid)
}

// ── process_isDebugged ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_isDebugged")]
pub fn process_is_debugged(pid: i32) -> bool {
    let status_path = format!("/proc/{}/status", pid);
    if let Ok(content) = fs::read_to_string(&status_path) {
        for line in content.lines() {
            if line.starts_with("TracerPid:") {
                let val = line["TracerPid:".len()..].trim();
                return val != "0";
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_isDebugged")]
pub fn process_is_debugged(pid: i32) -> bool {
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_INFORMATION) {
        unsafe {
            let mut debugged: BOOL = BOOL(0);
            let result = CheckRemoteDebuggerPresent(h, &mut debugged);
            let _ = CloseHandle(h);
            if result.is_ok() {
                return debugged.as_bool();
            }
        }
    }
    false
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_isDebugged")]
pub fn process_is_debugged(pid: i32) -> bool {
    mac_is_debugged(pid)
}

// ── process_getPID ──────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getPID")]
pub fn process_get_pid(pid: i32) -> f64 {
    pid as f64
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "process_getPID")]
pub fn process_get_pid(pid: i32) -> f64 {
    pid as f64
}

// ── process_getHandle ───────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getHandle")]
pub fn process_get_handle(_pid: i32) -> f64 {
    0.0
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getHandle")]
pub fn process_get_handle(pid: i32) -> f64 {
    // Return process handle; caller should note this is a snapshot
    if let Some(h) = win_open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION) {
        let val = h.0 as u64 as f64;
        unsafe { let _ = CloseHandle(h); }
        val
    } else {
        0.0
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getHandle")]
pub fn process_get_handle(pid: i32) -> f64 {
    mac_get_task(pid) as f64
}

// ── process_getName ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getName")]
pub fn process_get_name(pid: i32) -> String {
    proc_open(pid).map(|p| p.name).unwrap_or_default()
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getName")]
pub fn process_get_name(pid: i32) -> String {
    win_get_name(pid)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getName")]
pub fn process_get_name(pid: i32) -> String {
    mac_get_name(pid)
}

// ── process_getPath ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getPath")]
pub fn process_get_path(pid: i32) -> String {
    proc_open(pid).map(|p| p.path).unwrap_or_default()
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getPath")]
pub fn process_get_path(pid: i32) -> String {
    win_get_path(pid)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getPath")]
pub fn process_get_path(pid: i32) -> String {
    mac_get_path(pid)
}

// ── process_exit ────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_exit")]
pub fn process_exit(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGTERM); }
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_exit")]
pub fn process_exit(pid: i32) {
    if pid <= 0 { return; }
    let target_pid = pid as u32;
    unsafe {
        let _ = EnumWindows(
            Some(exit_enum_callback),
            LPARAM(target_pid as isize),
        );
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn exit_enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let target_pid = lparam.0 as u32;
    let mut window_pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
    if window_pid == target_pid {
        let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
    }
    BOOL(1) // continue enumeration
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_exit")]
pub fn process_exit(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGTERM); }
    }
}

// ── process_kill ────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_kill")]
pub fn process_kill(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGKILL); }
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_kill")]
pub fn process_kill(pid: i32) {
    if let Some(h) = win_open_process(pid, PROCESS_TERMINATE) {
        unsafe {
            let _ = TerminateProcess(h, (-1i32) as u32);
            let _ = CloseHandle(h);
        }
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_kill")]
pub fn process_kill(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGKILL); }
    }
}

// ── process_hasExited ───────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_hasExited")]
pub fn process_has_exited(pid: i32) -> bool {
    proc_has_exited(pid)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_hasExited")]
pub fn process_has_exited(pid: i32) -> bool {
    win_has_exited(pid)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_hasExited")]
pub fn process_has_exited(pid: i32) -> bool {
    !mac_process_exists(pid)
}

// ── process_getModules ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getModules")]
pub fn process_get_modules(env: Env, pid: i32, regex_str: Option<String>) -> Result<napi::JsObject> {
    let maps_path = format!("/proc/{}/maps", pid);
    let mut modules = Vec::new();

    if let Ok(content) = fs::read_to_string(&maps_path) {
        let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
        let mut seen = std::collections::HashSet::new();

        for line in content.lines() {
            let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
            if parts.len() < 6 { continue; }
            let path_str = parts[5].trim();
            if path_str.is_empty() || path_str.starts_with('[') { continue; }
            if seen.contains(path_str) { continue; }
            seen.insert(path_str.to_string());

            let name = std::path::Path::new(path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if let Some(ref re) = pattern {
                if !re.is_match(&name) { continue; }
            }

            let addr_parts: Vec<&str> = parts[0].split('-').collect();
            let base = u64::from_str_radix(addr_parts[0], 16).unwrap_or(0);
            let end = u64::from_str_radix(addr_parts.get(1).unwrap_or(&"0"), 16).unwrap_or(0);

            modules.push((name, path_str.to_string(), base, end - base));
        }
    }

    let mut arr = env.create_array(modules.len() as u32)?;
    for (i, (name, path, base, size)) in modules.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set("valid", true)?;
        obj.set("name", name.as_str())?;
        obj.set("path", path.as_str())?;
        obj.set("base", *base as f64)?;
        obj.set("size", *size as f64)?;
        obj.set("pid", pid)?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getModules")]
pub fn process_get_modules(env: Env, pid: i32, regex_str: Option<String>) -> Result<napi::JsObject> {
    let mut modules = Vec::new();
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());

    if let Some(h) = win_open_process(pid, PROCESS_QUERY_INFORMATION | PROCESS_VM_READ) {
        unsafe {
            let mut hmods = [HMODULE::default(); 1024];
            let mut needed: u32 = 0;
            if EnumProcessModulesEx(h, hmods.as_mut_ptr(), std::mem::size_of_val(&hmods) as u32, &mut needed, LIST_MODULES_ALL).is_ok() {
                let count = (needed as usize / std::mem::size_of::<HMODULE>()).min(hmods.len());
                for i in 0..count {
                    let mut name_buf = [0u16; 512];
                    let name_len = GetModuleFileNameExW(h, hmods[i], &mut name_buf);
                    if name_len == 0 { continue; }
                    let path = String::from_utf16_lossy(&name_buf[..name_len as usize]).replace('\\', "/");
                    let name = path.rsplit('/').next().unwrap_or("").to_string();

                    if let Some(ref re) = pattern {
                        if !re.is_match(&name) { continue; }
                    }

                    let mut mod_info: MODULEINFO = std::mem::zeroed();
                    if GetModuleInformation(h, hmods[i], &mut mod_info, std::mem::size_of::<MODULEINFO>() as u32).is_ok() {
                        modules.push((name, path, mod_info.lpBaseOfDll as u64, mod_info.SizeOfImage as u64));
                    }
                }
            }
            let _ = CloseHandle(h);
        }
    }

    let mut arr = env.create_array(modules.len() as u32)?;
    for (i, (name, path, base, size)) in modules.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set("valid", true)?;
        obj.set("name", name.as_str())?;
        obj.set("path", path.as_str())?;
        obj.set("base", *base as f64)?;
        obj.set("size", *size as f64)?;
        obj.set("pid", pid)?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getModules")]
pub fn process_get_modules(env: Env, pid: i32, regex_str: Option<String>) -> Result<napi::JsObject> {
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
    let mut modules: Vec<(String, String, u64, u64)> = Vec::new();

    let task = mac_get_task(pid);
    if task != 0 {
        let proc_path = mac_get_path(pid);
        let is_64bit = mac_is_64_bit(pid);

        unsafe {
            // Get TASK_DYLD_INFO
            let mut dyld_info: TaskDyldInfo = std::mem::zeroed();
            let mut count = TASK_DYLD_INFO_COUNT;
            if task_info(
                task, TASK_DYLD_INFO,
                &mut dyld_info as *mut _ as *mut i32,
                &mut count,
            ) == 0 {
                // Read AllImageInfo
                let mut all_info: AllImageInfo = std::mem::zeroed();
                let read_size = (dyld_info.all_image_info_size as usize)
                    .min(std::mem::size_of::<AllImageInfo>());
                let mut bytes_read: u64 = 0;

                if mach_vm_read_overwrite(
                    task,
                    dyld_info.all_image_info_addr,
                    read_size as u64,
                    &mut all_info as *mut _ as u64,
                    &mut bytes_read,
                ) == 0 && bytes_read == read_size as u64 && all_info.count > 0 && is_64bit {
                    // Read 64-bit image info array
                    let array_addr = all_info.array;
                    if array_addr != 0 {
                        let info_size = std::mem::size_of::<ImageInfo64>() * all_info.count as usize;
                        let mut infos = vec![ImageInfo64 { addr: 0, path: 0, date: 0 }; all_info.count as usize];
                        let mut info_bytes: u64 = 0;

                        if mach_vm_read_overwrite(
                            task,
                            array_addr,
                            info_size as u64,
                            infos.as_mut_ptr() as u64,
                            &mut info_bytes,
                        ) == 0 && info_bytes == info_size as u64 {
                            for i in 0..all_info.count as usize {
                                let (name, path) = if i == 0 {
                                    // First entry is the executable itself
                                    let n = proc_path.rsplit('/').next().unwrap_or("").to_string();
                                    (n, proc_path.clone())
                                } else {
                                    // Read path from remote process memory
                                    let mut path_buf = vec![0u8; libc::PATH_MAX as usize];
                                    let mut path_bytes: u64 = 0;
                                    if mach_vm_read_overwrite(
                                        task,
                                        infos[i].path,
                                        libc::PATH_MAX as u64,
                                        path_buf.as_mut_ptr() as u64,
                                        &mut path_bytes,
                                    ) != 0 || path_bytes == 0 {
                                        continue;
                                    }
                                    let path_str = std::ffi::CStr::from_ptr(path_buf.as_ptr() as *const i8)
                                        .to_string_lossy().to_string();
                                    // Resolve via realpath
                                    let resolved = {
                                        let c_path = std::ffi::CString::new(path_str.as_bytes()).unwrap_or_default();
                                        let rp = libc::realpath(c_path.as_ptr(), std::ptr::null_mut());
                                        if rp.is_null() {
                                            path_str.clone()
                                        } else {
                                            let s = std::ffi::CStr::from_ptr(rp).to_string_lossy().to_string();
                                            libc::free(rp as *mut libc::c_void);
                                            s
                                        }
                                    };
                                    let n = resolved.rsplit('/').next().unwrap_or("").to_string();
                                    (n, resolved)
                                };

                                if let Some(ref re) = pattern {
                                    if !re.is_match(&name) { continue; }
                                }
                                modules.push((name, path, infos[i].addr, 0));
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort and deduplicate by address (matching C++)
    modules.sort_by_key(|m| m.2);
    modules.dedup_by_key(|m| m.2);

    let mut arr = env.create_array(modules.len() as u32)?;
    for (i, (name, path, base, size)) in modules.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set("valid", true)?;
        obj.set("name", name.as_str())?;
        obj.set("path", path.as_str())?;
        obj.set("base", *base as f64)?;
        obj.set("size", *size as f64)?;
        obj.set("pid", pid)?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

// ── process_getWindows ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getWindows")]
pub fn process_get_windows(env: Env, pid: i32, regex_str: Option<String>) -> Result<napi::JsObject> {
    unsafe {
        let d = get_display();
        if d.is_null() {
            return Ok(env.create_array(0)?.coerce_to_object()?);
        }
        let _xe = XDismissErrors::new();

        let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
        let mut results = Vec::new();
        let root = XDefaultRootWindow(d);
        crate::window::enum_windows_with_pid(root, pattern.as_ref(), pid, &mut results);

        let mut arr = env.create_array(results.len() as u32)?;
        for (i, &h) in results.iter().enumerate() {
            arr.set(i as u32, h as f64)?;
        }
        Ok(arr.coerce_to_object()?)
    }
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "process_getWindows")]
pub fn process_get_windows(env: Env, _pid: i32, _regex_str: Option<String>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
}

// ── process_getList ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getList")]
pub fn process_get_list(env: Env, regex_str: Option<String>) -> Result<napi::JsObject> {
    let mut pids = Vec::new();
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());

    if let Ok(entries) = fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.chars().all(|c| c.is_ascii_digit()) {
                let pid: i32 = name_str.parse().unwrap_or(0);
                if pid <= 0 { continue; }
                if let Some(ref re) = pattern {
                    if let Some(info) = proc_open(pid) {
                        if !re.is_match(&info.name) { continue; }
                    } else {
                        continue;
                    }
                }
                pids.push(pid);
            }
        }
    }

    let mut arr = env.create_array(pids.len() as u32)?;
    for (i, &pid) in pids.iter().enumerate() {
        arr.set(i as u32, pid)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getList")]
pub fn process_get_list(env: Env, regex_str: Option<String>) -> Result<napi::JsObject> {
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
    let mut pids = Vec::new();

    unsafe {
        let mut buf = [0u32; 4096];
        let mut needed: u32 = 0;
        if EnumProcesses(buf.as_mut_ptr(), std::mem::size_of_val(&buf) as u32, &mut needed).is_ok() {
            let count = needed as usize / std::mem::size_of::<u32>();
            for i in 0..count {
                let pid = buf[i] as i32;
                if pid <= 0 { continue; }
                if let Some(ref re) = pattern {
                    let name = win_get_name(pid);
                    if name.is_empty() || !re.is_match(&name) { continue; }
                }
                pids.push(pid);
            }
        }
    }

    let mut arr = env.create_array(pids.len() as u32)?;
    for (i, &pid) in pids.iter().enumerate() {
        arr.set(i as u32, pid)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getList")]
pub fn process_get_list(env: Env, regex_str: Option<String>) -> Result<napi::JsObject> {
    let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());

    unsafe {
        // First call to get count
        let count = proc_listallpids(std::ptr::null_mut(), 0);
        if count <= 0 {
            return Ok(env.create_array(0)?.coerce_to_object()?);
        }
        // Allocate with some extra space
        let buf_size = (count as usize + 64) * std::mem::size_of::<i32>();
        let mut pids = vec![0i32; count as usize + 64];
        let actual = proc_listallpids(pids.as_mut_ptr() as *mut libc::c_void, buf_size as i32);
        if actual <= 0 {
            return Ok(env.create_array(0)?.coerce_to_object()?);
        }
        let num_pids = actual as usize / std::mem::size_of::<i32>();

        let mut results = Vec::new();
        for i in 0..num_pids {
            let pid = pids[i];
            if pid <= 0 { continue; }
            if let Some(ref pat) = pattern {
                let name = mac_get_name(pid);
                if name.is_empty() || !pat.is_match(&name) { continue; }
            }
            results.push(pid);
        }

        let mut arr = env.create_array(results.len() as u32)?;
        for (i, &pid) in results.iter().enumerate() {
            arr.set(i as u32, pid as f64)?;
        }
        Ok(arr.coerce_to_object()?)
    }
}

// ── process_getCurrent ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getCurrent")]
pub fn process_get_current() -> f64 {
    unsafe { libc::getpid() as f64 }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_getCurrent")]
pub fn process_get_current() -> f64 {
    unsafe { GetCurrentProcessId() as f64 }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_getCurrent")]
pub fn process_get_current() -> f64 {
    unsafe { libc::getpid() as f64 }
}

// ── process_isSys64Bit ──────────────────────────────────────────────────

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    unsafe {
        let mut info: libc::utsname = std::mem::zeroed();
        if libc::uname(&mut info) == 0 {
            let machine = std::ffi::CStr::from_ptr(info.machine.as_ptr());
            if let Ok(s) = machine.to_str() {
                return s == "x86_64" || s == "aarch64" || s == "arm64";
            }
        }
        // Fallback to compile-time check
        cfg!(target_pointer_width = "64")
    }
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    unsafe {
        let mut info: windows::Win32::System::SystemInformation::SYSTEM_INFO = std::mem::zeroed();
        windows::Win32::System::SystemInformation::GetNativeSystemInfo(&mut info);
        use windows::Win32::System::SystemInformation::PROCESSOR_ARCHITECTURE;
        // PROCESSOR_ARCHITECTURE_AMD64 = 9, PROCESSOR_ARCHITECTURE_ARM64 = 12
        let arch = info.Anonymous.Anonymous.wProcessorArchitecture;
        arch == PROCESSOR_ARCHITECTURE(9) || arch == PROCESSOR_ARCHITECTURE(12)
    }
}

// ── process_getSegments ─────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_getSegments")]
pub fn process_get_segments(env: Env, pid: i32, base: f64) -> Result<napi::JsObject> {
    let maps_path = format!("/proc/{}/maps", pid);
    let base_addr = base as u64;
    let mut segments = Vec::new();

    if let Ok(content) = fs::read_to_string(&maps_path) {
        let mut module_path = String::new();
        for line in content.lines() {
            let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
            if parts.len() < 6 { continue; }
            let addr_parts: Vec<&str> = parts[0].split('-').collect();
            let start = u64::from_str_radix(addr_parts[0], 16).unwrap_or(0);
            if start == base_addr {
                module_path = parts[5].trim().to_string();
                break;
            }
        }

        if !module_path.is_empty() {
            for line in content.lines() {
                let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
                if parts.len() < 6 { continue; }
                let path_str = parts[5].trim();
                if path_str != module_path { continue; }

                let addr_parts: Vec<&str> = parts[0].split('-').collect();
                let start = u64::from_str_radix(addr_parts[0], 16).unwrap_or(0);
                let end = u64::from_str_radix(addr_parts.get(1).unwrap_or(&"0"), 16).unwrap_or(0);
                let perms = parts[1];

                segments.push((start, end - start, perms.to_string()));
            }
        }
    }

    let mut arr = env.create_array(segments.len() as u32)?;
    for (i, (seg_base, size, name)) in segments.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set("valid", true)?;
        obj.set("base", *seg_base as f64)?;
        obj.set("size", *size as f64)?;
        obj.set("name", name.as_str())?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[cfg(not(target_os = "linux"))]
#[napi(js_name = "process_getSegments")]
pub fn process_get_segments(env: Env, _pid: i32, _base: f64) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
}
