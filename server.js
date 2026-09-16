// Optional: NutriCost UI only (no .NET API). Port 5003 so 5000 stays for Wasabi Apps homepage.
// Run: node server.js   then open http://localhost:5003
var http = require("http");
var fs = require("fs");
var path = require("path");

var PORT = 5003;
var ROOT = __dirname;

var mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

var server = http.createServer(function (req, res) {
  var url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  var file = path.join(ROOT, url);
  fs.readFile(file, function (err, data) {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } else {
        res.writeHead(500);
        res.end("Server error");
      }
      return;
    }
    var ext = path.extname(file);
    var type = mime[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log("NutriCost server: http://localhost:" + PORT);
  console.log("Press Ctrl+C to stop.");
});
