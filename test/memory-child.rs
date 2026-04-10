// Cross-process memory test helper.
//
// Purpose: stand in for the real-world "game trainer" scenario where a
// mechatron caller attaches to a foreign target process.  Because Node.js
// ships with the hardened runtime on macOS, it makes a bad target without
// custom entitlements; a plain compiled binary does not enable hardened
// runtime by default, so mechatron's Memory API can attach to it as long
// as the caller is the same user (the exact same rule that applies when
// a user has fully disabled SIP or enabled Developer Mode to allow
// debugging third-party apps).
//
// Protocol:
//   argv[1]  Initial buffer contents as lowercase hex (even length).
//   stdout   Prints the current buffer hex dump once on startup, then
//            once per line the parent writes to stdin.  The parent uses
//            the initial dump to locate the buffer via Memory.find() and
//            uses subsequent dumps to verify that its cross-process
//            writes actually landed in the target's address space.
//   stdin    Any line triggers a fresh hex dump.  Closing stdin or EOF
//            causes the helper to exit cleanly.
//
// The buffer is read through std::ptr::read_volatile on every dump so
// the compiler cannot hoist or cache reads — the parent writes to this
// memory from a different process, which is invisible to the optimizer.

use std::io::{BufRead, Write};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: {} <hex-bytes>", args[0]);
        std::process::exit(1);
    }
    let hex = &args[1];
    if hex.len() % 2 != 0 {
        eprintln!("hex must have even length");
        std::process::exit(1);
    }

    let mut buf: Box<[u8]> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("invalid hex"))
        .collect::<Vec<u8>>()
        .into_boxed_slice();

    // Keep the allocation stable and visible by reading through a raw
    // pointer on every dump.
    let ptr: *const u8 = buf.as_ptr();
    let len: usize = buf.len();

    let dump = || -> String {
        let mut s = String::with_capacity(len * 2);
        for i in 0..len {
            let byte = unsafe { std::ptr::read_volatile(ptr.add(i)) };
            s.push_str(&format!("{:02x}", byte));
        }
        s
    };

    let stdout = std::io::stdout();
    let mut stdout = stdout.lock();

    // Initial dump also serves as a READY signal for the parent.
    writeln!(stdout, "{}", dump()).unwrap();
    stdout.flush().unwrap();

    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(_) => {
                writeln!(stdout, "{}", dump()).unwrap();
                stdout.flush().unwrap();
            }
            Err(_) => break,
        }
    }

    // Tell the compiler the buffer is "used" until the very end so the
    // allocation can't be dead-code-eliminated.
    std::hint::black_box(&mut buf);
}
