use napi_derive::napi;
use std::time::{Duration, Instant};

static mut EPOCH: Option<Instant> = None;
static EPOCH_INIT: std::sync::Once = std::sync::Once::new();

fn get_epoch() -> Instant {
    unsafe {
        EPOCH_INIT.call_once(|| { EPOCH = Some(Instant::now()); });
        EPOCH.unwrap()
    }
}

pub fn timer_sleep_range(min: u32, max: u32) {
    let d = if max <= min {
        min
    } else {
        // Simple random in range using time-based seed
        let t = get_epoch().elapsed().as_nanos() as u32;
        min + (t % (max - min + 1))
    };
    if d > 0 {
        std::thread::sleep(Duration::from_millis(d as u64));
    }
}

#[napi(js_name = "sleep")]
pub fn sleep(min: i32, max: Option<i32>) {
    let min_u = min.max(0) as u32;
    let max_u = max.unwrap_or(min).max(0) as u32;
    timer_sleep_range(min_u, max_u);
}

#[napi(js_name = "clock")]
pub fn clock() -> f64 {
    get_epoch().elapsed().as_millis() as f64
}
