use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fs;
use std::path::Path;

// Memory region info
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

fn is_proc_valid(pid: i32) -> bool {
    pid > 0 && Path::new(&format!("/proc/{}", pid)).exists()
}

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
            valid: true,
            bound: true,
            start,
            stop,
            size: stop - start,
            readable,
            writable,
            executable,
            access,
            private: is_private,
            guarded: false,
        });
    }
    regions
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

#[napi(js_name = "memory_isValid")]
pub fn memory_is_valid(pid: i32) -> bool {
    is_proc_valid(pid)
}

#[napi(js_name = "memory_getRegion")]
pub fn memory_get_region(env: Env, pid: i32, address: f64) -> Result<napi::JsObject> {
    let addr = address as u64;
    let regions = parse_maps(pid);
    for r in &regions {
        if addr >= r.start && addr < r.stop {
            return region_to_obj(&env, r);
        }
    }
    region_to_obj(&env, &RegionInfo::default())
}

#[napi(js_name = "memory_getRegions")]
pub fn memory_get_regions(env: Env, pid: i32, start: Option<f64>, stop: Option<f64>) -> Result<napi::JsObject> {
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let regions = parse_maps(pid);

    let filtered: Vec<&RegionInfo> = regions.iter()
        .filter(|r| r.stop > start_addr && r.start < stop_addr)
        .collect();

    let mut arr = env.create_array(filtered.len() as u32)?;
    for (i, r) in filtered.iter().enumerate() {
        let obj = region_to_obj(&env, r)?;
        arr.set(i as u32, obj)?;
    }
    Ok(arr.coerce_to_object()?)
}

#[napi(js_name = "memory_setAccess")]
pub fn memory_set_access(pid: i32, region_start: f64, readable: bool, writable: bool, executable: bool) -> bool {
    // mprotect can't be applied to another process's memory on Linux
    // The C++ implementation likely uses /proc/pid/mem or ptrace
    false
}

#[napi(js_name = "memory_setAccessFlags")]
pub fn memory_set_access_flags(pid: i32, region_start: f64, flags: u32) -> bool {
    false
}

#[napi(js_name = "memory_getPtrSize")]
pub fn memory_get_ptr_size(pid: i32) -> f64 {
    if !is_proc_valid(pid) { return 0.0; }
    // Read ELF header to determine pointer size
    let exe_path = format!("/proc/{}/exe", pid);
    if let Ok(data) = fs::read(&exe_path) {
        if data.len() > 4 {
            return if data[4] == 2 { 8.0 } else { 4.0 };
        }
    }
    (std::mem::size_of::<usize>()) as f64
}

#[napi(js_name = "memory_getMinAddress")]
pub fn memory_get_min_address(pid: i32) -> f64 {
    let regions = parse_maps(pid);
    regions.first().map(|r| r.start as f64).unwrap_or(0.0)
}

#[napi(js_name = "memory_getMaxAddress")]
pub fn memory_get_max_address(pid: i32) -> f64 {
    let regions = parse_maps(pid);
    regions.last().map(|r| r.stop as f64).unwrap_or(0.0)
}

#[napi(js_name = "memory_getPageSize")]
pub fn memory_get_page_size(_pid: i32) -> f64 {
    unsafe { libc::sysconf(libc::_SC_PAGESIZE) as f64 }
}

#[napi(js_name = "memory_find")]
pub fn memory_find(
    env: Env, pid: i32, pattern: String,
    start: Option<f64>, stop: Option<f64>,
    limit: Option<f64>, _flags: Option<String>,
) -> Result<napi::JsObject> {
    // Pattern search through process memory using process_vm_readv
    let start_addr = start.unwrap_or(0.0) as u64;
    let stop_addr = stop.unwrap_or(u64::MAX as f64) as u64;
    let max_results = if limit.unwrap_or(0.0) > 0.0 { limit.unwrap() as usize } else { usize::MAX };

    let regions = parse_maps(pid);
    let mut addresses = Vec::new();

    // Parse hex pattern like "DE AD BE EF" or "?? AD ?? EF"
    let pattern_bytes: Vec<Option<u8>> = pattern.split_whitespace()
        .filter_map(|s| {
            if s == "??" || s == "?" { Some(None) }
            else { u8::from_str_radix(s, 16).ok().map(Some) }
        })
        .collect();

    if pattern_bytes.is_empty() {
        return Ok(env.create_array(0)?.coerce_to_object()?);
    }

    for region in &regions {
        if !region.readable || region.stop <= start_addr || region.start >= stop_addr {
            continue;
        }
        if addresses.len() >= max_results { break; }

        let read_start = region.start.max(start_addr);
        let read_end = region.stop.min(stop_addr);
        let read_size = (read_end - read_start) as usize;
        if read_size == 0 || read_size > 256 * 1024 * 1024 { continue; }

        let mut buf = vec![0u8; read_size];
        let bytes_read = read_process_memory(pid, read_start, &mut buf);
        if bytes_read == 0 { continue; }

        // Search for pattern
        let buf = &buf[..bytes_read];
        if pattern_bytes.len() > buf.len() { continue; }

        for i in 0..=(buf.len() - pattern_bytes.len()) {
            if addresses.len() >= max_results { break; }
            let mut matched = true;
            for (j, &pb) in pattern_bytes.iter().enumerate() {
                if let Some(expected) = pb {
                    if buf[i + j] != expected {
                        matched = false;
                        break;
                    }
                }
            }
            if matched {
                addresses.push((read_start + i as u64) as f64);
            }
        }
    }

    let mut arr = env.create_array(addresses.len() as u32)?;
    for (i, &addr) in addresses.iter().enumerate() {
        arr.set(i as u32, addr)?;
    }
    Ok(arr.coerce_to_object()?)
}

fn read_process_memory(pid: i32, address: u64, buf: &mut [u8]) -> usize {
    unsafe {
        let local_iov = libc::iovec {
            iov_base: buf.as_mut_ptr() as *mut _,
            iov_len: buf.len(),
        };
        let remote_iov = libc::iovec {
            iov_base: address as *mut _,
            iov_len: buf.len(),
        };
        let result = libc::process_vm_readv(pid, &local_iov, 1, &remote_iov, 1, 0);
        if result < 0 { 0 } else { result as usize }
    }
}

fn write_process_memory(pid: i32, address: u64, buf: &[u8]) -> usize {
    unsafe {
        let local_iov = libc::iovec {
            iov_base: buf.as_ptr() as *mut _,
            iov_len: buf.len(),
        };
        let remote_iov = libc::iovec {
            iov_base: address as *mut _,
            iov_len: buf.len(),
        };
        let result = libc::process_vm_writev(pid, &local_iov, 1, &remote_iov, 1, 0);
        if result < 0 { 0 } else { result as usize }
    }
}

#[napi(js_name = "memory_readData")]
pub fn memory_read_data(
    env: Env, pid: i32, address: f64, length: f64, _flags: Option<i32>,
) -> Result<Either<Buffer, napi::JsNull>> {
    let len = length as usize;
    let addr = address as u64;
    let mut buf = vec![0u8; len];
    let read = read_process_memory(pid, addr, &mut buf);
    if read > 0 {
        Ok(Either::A(Buffer::from(buf)))
    } else {
        Ok(Either::B(env.get_null()?))
    }
}

#[napi(js_name = "memory_writeData")]
pub fn memory_write_data(pid: i32, address: f64, data: Buffer, _flags: Option<i32>) -> f64 {
    let addr = address as u64;
    write_process_memory(pid, addr, &data) as f64
}

// Cache operations — simplified stubs (the C++ version uses a complex caching system)
#[napi(js_name = "memory_createCache")]
pub fn memory_create_cache(
    _pid: i32, _address: f64, _size: f64, _block_size: f64,
    _max_blocks: Option<f64>, _flags: Option<f64>,
) -> bool {
    false
}

#[napi(js_name = "memory_clearCache")]
pub fn memory_clear_cache(_pid: i32) {}

#[napi(js_name = "memory_deleteCache")]
pub fn memory_delete_cache(_pid: i32) {}

#[napi(js_name = "memory_isCaching")]
pub fn memory_is_caching(_pid: i32) -> bool {
    false
}

#[napi(js_name = "memory_getCacheSize")]
pub fn memory_get_cache_size(_pid: i32) -> f64 {
    0.0
}
