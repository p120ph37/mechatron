extern "C" {
    pub fn mach_task_self() -> u32;
    pub fn task_for_pid(target_tport: u32, pid: i32, t: *mut u32) -> i32;
    pub fn mach_vm_read_overwrite(
        target_task: u32, address: u64, size: u64,
        data: u64, outsize: *mut u64,
    ) -> i32;
}

pub fn get_task(pid: i32) -> u32 {
    if pid <= 0 { return 0; }
    unsafe {
        let mut task: u32 = 0;
        if task_for_pid(mach_task_self(), pid, &mut task) != 0 {
            return 0;
        }
        task
    }
}

pub fn process_exists(pid: i32) -> bool {
    if pid <= 0 { return false; }
    unsafe {
        if libc::kill(pid, 0) == 0 { return true; }
        *libc::__error() != libc::ESRCH
    }
}
