"use strict";
// Helper for the cross-process memory test.
// Usage: node memory-child.js <uuid-hex> <port-file>
var h = require("http");
var f = require("fs");
var b = Buffer.alloc(64);
b.write(process.argv[2], "hex");
var s = h.createServer(function (q, r) { r.end(b.toString("hex")); });
s.listen(0, function () {
	f.writeFileSync(process.argv[3], "" + s.address().port);
});
