// Zero-install Node.js adapter for the same service used by Express.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DemoRepository } = require('./repository');
const { createService } = require('./service');
const handle = createService(new DemoRepository());
const publicRoot = path.join(__dirname, '../public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const allowed = new Set(['/index.html', '/style.css', '/script.js', '/js/allocator.js', '/js/demo-data.js']);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 100000) { res.writeHead(413); res.end('Request too large'); return; }
      }
      let data;
      try { data = body ? JSON.parse(body) : undefined; }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON.' })); return; }
      const result = await handle(req.method, pathname, data);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body)); return;
    }
    const file = pathname === '/' ? '/index.html' : pathname;
    if (!['GET', 'HEAD'].includes(req.method) || !allowed.has(file)) { res.writeHead(404); res.end('Not found'); return; }
    const bytes = await fs.readFile(path.join(publicRoot, file));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(500); res.end('Server error'); }
});
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`Demo server: http://localhost:${port} · Sample data, memory storage`));
}
module.exports = server;
