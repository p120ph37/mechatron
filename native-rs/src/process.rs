use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::{CStr, CString};
use std::fs;
use std::path::Path;

use crate::x11::*;
use crate::window;

// Process info for Linux — open /proc/pid/ to get details
struct ProcInfo {
    pid: i32,
    name: String,
    path: String,
    is_64bit: bool,
}

fn proc_open(pid: i32) -> Option<ProcInfo> {
    if pid <= 0 { return None; }

    // Check if process exists via /proc/pid
    let proc_dir = format!("/proc/{}", pid);
    if !Path::new(&proc_dir).exists() { return None; }

    let exe_link = format!("/proc/{}/exe", pid);
    let mut path = String::new();
    let mut name = String::new();
    let mut is_64bit = cfg!(target_pointer_width = "64");

    // Read the exe symlink
    if let Ok(target) = fs::read_link(&exe_link) {
        path = target.to_string_lossy().to_string();
        if let Some(fname) = target.file_name() {
            name = fname.to_string_lossy().to_string();
        }
    }

    // Determine architecture from ELF header
    if let Ok(data) = fs::read(&exe_link) {
        if data.len() > 4 {
            // ELF class: byte 4, 1=32bit, 2=64bit
            is_64bit = data[4] == 2;
        }
    }

    Some(ProcInfo { pid, name, path, is_64bit })
}

fn proc_has_exited(pid: i32) -> bool {
    if pid <= 0 { return true; }
    // Check if /proc/pid exists
    !Path::new(&format!("/proc/{}", pid)).exists()
}

#[napi(js_name = "process_open")]
pub fn process_open(pid: i32) -> bool {
    proc_open(pid).is_some()
}

#[napi(js_name = "process_close")]
pub fn process_close(_pid: i32) {
    // No-op on Linux (no handle to close)
}

#[napi(js_name = "process_isValid")]
pub fn process_is_valid(pid: i32) -> bool {
    proc_open(pid).is_some()
}

#[napi(js_name = "process_is64Bit")]
pub fn process_is_64_bit(pid: i32) -> bool {
    proc_open(pid).map(|p| p.is_64bit).unwrap_or(false)
}

#[napi(js_name = "process_isDebugged")]
pub fn process_is_debugged(pid: i32) -> bool {
    // Check TracerPid in /proc/pid/status
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

#[napi(js_name = "process_getPID")]
pub fn process_get_pid(pid: i32) -> f64 {
    pid as f64
}

#[napi(js_name = "process_getName")]
pub fn process_get_name(pid: i32) -> String {
    proc_open(pid).map(|p| p.name).unwrap_or_default()
}

#[napi(js_name = "process_getPath")]
pub fn process_get_path(pid: i32) -> String {
    proc_open(pid).map(|p| p.path).unwrap_or_default()
}

#[napi(js_name = "process_exit")]
pub fn process_exit(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGTERM); }
    }
}

#[napi(js_name = "process_kill")]
pub fn process_kill(pid: i32) {
    if pid > 0 {
        unsafe { libc::kill(pid, libc::SIGKILL); }
    }
}

#[napi(js_name = "process_hasExited")]
pub fn process_has_exited(pid: i32) -> bool {
    proc_has_exited(pid)
}

#[napi(js_name = "process_getModules")]
pub fn process_get_modules(env: Env, pid: i32, regex_str: Option<String>) -> Result<napi::JsObject> {
    let maps_path = format!("/proc/{}/maps", pid);
    let mut modules = Vec::new();

    if let Ok(content) = fs::read_to_string(&maps_path) {
        let pattern = regex_str.as_ref().and_then(|s| regex::Regex::new(s).ok());
        let mut seen = std::collections::HashSet::new();

        for line in content.lines() {
            // Format: addr-addr perms offset dev inode pathname
            let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
            if parts.len() < 6 { continue; }
            let path_str = parts[5].trim();
            if path_str.is_empty() || path_str.starts_with('[') { continue; }
            if seen.contains(path_str) { continue; }
            seen.insert(path_str.to_string());

            let name = Path::new(path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if let Some(ref re) = pattern {
                if !re.is_match(&name) { continue; }
            }

            // Parse address range
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

#[napi(js_name = "process_getCurrent")]
pub fn process_get_current() -> f64 {
    unsafe { libc::getpid() as f64 }
}

#[napi(js_name = "process_isSys64Bit")]
pub fn process_is_sys_64_bit() -> bool {
    cfg!(target_pointer_width = "64")
}

#[napi(js_name = "process_getSegments")]
pub fn process_get_segments(env: Env, pid: i32, base: f64) -> Result<napi::JsObject> {
    // Read /proc/pid/maps and find segments for the module at base address
    let maps_path = format!("/proc/{}/maps", pid);
    let base_addr = base as u64;
    let mut segments = Vec::new();

    if let Ok(content) = fs::read_to_string(&maps_path) {
        // First find the module path at the base address
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
