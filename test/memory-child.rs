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
//   argv[2]  Path where the helper writes its HTTP port after binding.
//
// The helper binds a loopback TCP socket on an ephemeral port, writes the
// port number to argv[2] as its readiness signal, and then serves any
// HTTP GET by responding with a fresh hex dump of the buffer.  Reads go
// through std::ptr::read_volatile on every dump so the compiler cannot
// hoist or cache them — the parent writes to this memory from a
// different process, which is invisible to the optimizer.
//
// Only the Rust stdlib is used, so this remains a standalone single-file
// `rustc` build with no Cargo workspace, no dependencies, and no
// crates.io lookups.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: {} <hex-bytes> <port-file>", args[0]);
        std::process::exit(1);
    }
    let hex = &args[1];
    let port_file = &args[2];
    if hex.len() % 2 != 0 {
        eprintln!("hex must have even length");
        std::process::exit(1);
    }

    let buf: Box<[u8]> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("invalid hex"))
        .collect::<Vec<u8>>()
        .into_boxed_slice();

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

    // Writing the port file serves as the "ready" signal for the parent.
    std::fs::write(port_file, port.to_string()).expect("write port");

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
