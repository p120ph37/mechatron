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
//   argv     (none)
//   stdin    Each newline triggers a fresh hex dump on stdout.  EOF or
//            a closed pipe causes the helper to exit cleanly.
//   stdout   For every newline received on stdin, prints the current
//            hex dump of the helper's internal 64-byte buffer as a
//            single line.  The parent uses the first dump both as the
//            readiness signal and to learn the initial buffer contents,
//            so it can locate the buffer in the helper's address space
//            via Memory.find().
//
// Reads go through std::ptr::read_volatile on every dump so the compiler
// cannot hoist or cache them — the parent writes to this memory from a
// different process, which is invisible to the optimizer.
//
// The initial buffer contents are generated at runtime from OS-seeded
// randomness (via std::collections::hash_map::RandomState), so nothing
// has to be passed in on the command line.
//
// Only the Rust stdlib is used, so this remains a standalone single-file
// `rustc` build with no Cargo workspace, no dependencies, and no
// crates.io lookups.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, Write};

// Pseudo-random byte generation keyed by a fresh RandomState.  Each
// RandomState is seeded from OS randomness at construction time, so the
// derived sequence differs on every run.  Not cryptographic, but plenty
// for a test needle.
fn gen_random(n: usize) -> Vec<u8> {
    let rs = RandomState::new();
    let mut out = Vec::with_capacity(n);
    let mut counter: u64 = 0;
    while out.len() < n {
        let mut h = rs.build_hasher();
        h.write_u64(counter);
        let v = h.finish();
        out.extend_from_slice(&v.to_le_bytes());
        counter = counter.wrapping_add(1);
    }
    out.truncate(n);
    out
}

fn main() {
    let buf: Box<[u8]> = gen_random(64).into_boxed_slice();

    // Closure captures `buf` by reference and re-reads it volatilely on
    // every call, so successive dumps reflect any writes the parent has
    // poked into the buffer from a different process.
    let dump = || -> String {
        let mut s = String::with_capacity(buf.len() * 2);
        for i in 0..buf.len() {
            let byte = unsafe { std::ptr::read_volatile(&buf[i]) };
            s.push_str(&format!("{:02x}", byte));
        }
        s
    };

    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(_) => {
                writeln!(out, "{}", dump()).expect("write dump");
                out.flush().expect("flush dump");
            }
            Err(_) => break,
        }
    }
}
