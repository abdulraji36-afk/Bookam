// Stand-in for api.telegram.org: remembers every message the app tries to send.
const http = require("node:http");
let messages = [];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/messages") return res.end(JSON.stringify(messages));
    if (req.method === "DELETE" && req.url === "/messages") { messages = []; return res.end("[]"); }
    if (req.method === "POST" && /^\/bottest-token\/sendMessage$/.test(req.url)) {
      messages.push(JSON.parse(body));
      return res.end(JSON.stringify({ ok: true, result: { message_id: messages.length } }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false }));
  });
}).listen(8099, "127.0.0.1");
