"use strict";
// Helper for the cross-process memory test.
// Usage: node memory-child.js <port-file>
// Allocates a 64-byte random buffer and serves its hex dump via HTTP.
var h = require("http");
var f = require("fs");
var b = require("crypto").randomBytes(64);
var s = h.createServer(function (q, r) { r.end(b.toString("hex")); });
s.listen(0, function () {
	f.writeFileSync(process.argv[2], "" + s.address().port);
});
