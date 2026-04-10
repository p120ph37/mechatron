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
//   argv      (none)
//   stdout    On startup, prints the bound TCP port as a single line,
//             which is the parent's readiness signal.
//   HTTP GET  Responds with a fresh hex dump of the helper's internal
//             64-byte buffer.  The parent learns the initial contents
//             by making a first HTTP request, locates the buffer in
//             the helper's address space by using that value as a
//             needle, then cross-process-writes to it and re-queries
//             to verify.
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
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

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

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("local_addr").port();

    // Announcing the port on stdout is the parent's "ready" signal.
    {
        let stdout = std::io::stdout();
        let mut out = stdout.lock();
        writeln!(out, "{}", port).expect("write port");
        out.flush().expect("flush port");
    }

    for conn in listener.incoming() {
        let mut stream = match conn {
            Ok(s) => s,
            Err(_) => continue,
        };

        // Consume the HTTP request up to the blank line separator.
        {
            let mut reader = BufReader::new(&mut stream);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(_) => break,
                }
                if line == "\r\n" || line == "\n" {
                    break;
                }
            }
        }

        let body = dump();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/plain\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n\
             {}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
    }
}
