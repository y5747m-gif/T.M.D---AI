const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = parsedUrl.pathname;

  // Handle API routes
  if (pathname.startsWith("/api/")) {
    const apiName = pathname.replace(/^\/api\//, "").replace(/\.js$/, "");
    const apiPath = path.join(ROOT, "api", `${apiName}.js`);

    if (fs.existsSync(apiPath)) {
      try {
        delete require.cache[require.resolve(apiPath)];
        const handler = require(apiPath);
        
        // Polyfill req.query and res helpers for serverless handler
        req.query = Object.fromEntries(parsedUrl.searchParams);
        
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", async () => {
          if (body) {
            try {
              req.body = JSON.parse(body);
            } catch {
              req.body = body;
            }
          }
          
          res.status = function(code) {
            this.statusCode = code;
            return this;
          };
          res.json = function(data) {
            this.setHeader("Content-Type", "application/json; charset=utf-8");
            this.end(JSON.stringify(data));
            return this;
          };
          res.send = function(data) {
            this.end(data);
            return this;
          };
          
          try {
            await handler(req, res);
          } catch (err) {
            console.error("API handler error:", err);
            if (!res.writableEnded) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          }
        });
        return;
      } catch (err) {
        console.error("Failed to load API:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }
  }

  // Handle Static Files
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.join(ROOT, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // Fallback to index.html for SPA if not found
    const indexPath = path.join(ROOT, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`T.M.D_AI_Pro dev server running at http://0.0.0.0:${PORT}`);
});
