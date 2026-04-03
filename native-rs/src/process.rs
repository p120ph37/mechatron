use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::ffi::{CStr, CString};
#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;

#[cfg(target_os = "linux")]
use crate::x11::*;
#[cfg(target_os = "linux")]
use crate::window;

// ── Linux internals ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
struct ProcInfo {
    pid: i32,
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

    Some(ProcInfo { pid, name, path, is_64bit })
}

#[cfg(target_os = "linux")]
fn proc_has_exited(pid: i32) -> bool {
    if pid <= 0 { return true; }
    !Path::new(&format!("/proc/{}", pid)).exists()
}

// ── Windows internals ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::ProcessStatus::*;

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
                return String::from_utf16_lossy(&buf[..size as usize]);
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
    path.rsplit('\\').next().unwrap_or("").to_string()
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
    win_is_valid(pid)
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_open")]
pub fn process_open(_pid: i32) -> bool {
    false
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
pub fn process_is_valid(_pid: i32) -> bool {
    false
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
pub fn process_is_64_bit(_pid: i32) -> bool {
    false
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
pub fn process_is_debugged(_pid: i32) -> bool {
    false
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
pub fn process_get_name(_pid: i32) -> String {
    String::new()
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
pub fn process_get_path(_pid: i32) -> String {
    String::new()
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
    if let Some(h) = win_open_process(pid, PROCESS_TERMINATE) {
        unsafe {
            let _ = TerminateProcess(h, 0);
            let _ = CloseHandle(h);
        }
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_exit")]
pub fn process_exit(_pid: i32) {}

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
            let _ = TerminateProcess(h, 1);
            let _ = CloseHandle(h);
        }
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_kill")]
pub fn process_kill(_pid: i32) {}

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
pub fn process_has_exited(_pid: i32) -> bool {
    true
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
                    let path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                    let name = path.rsplit('\\').next().unwrap_or("").to_string();

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
pub fn process_get_modules(env: Env, _pid: i32, _regex_str: Option<String>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
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
pub fn process_get_list(env: Env, _regex_str: Option<String>) -> Result<napi::JsObject> {
    Ok(env.create_array(0)?.coerce_to_object()?)
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
    0.0
}

// ── process_isSys64Bit ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    cfg!(target_pointer_width = "64")
}

#[cfg(target_os = "windows")]
#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    unsafe {
        let mut info: windows::Win32::System::SystemInformation::SYSTEM_INFO = std::mem::zeroed();
        windows::Win32::System::SystemInformation::GetNativeSystemInfo(&mut info);
        // PROCESSOR_ARCHITECTURE_AMD64 = 9, PROCESSOR_ARCHITECTURE_ARM64 = 12
        let arch = info.Anonymous.Anonymous.wProcessorArchitecture;
        arch == 9 || arch == 12
    }
}

#[cfg(target_os = "macos")]
#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    false
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
