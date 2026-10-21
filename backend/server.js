const fs = require('node:fs');
const path = require('node:path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const express = require('express');
const { MySQLRepository } = require('./repository');
const { createService } = require('./service');
const { createAuth } = require('./auth');

function createApp(repository, authOptions) {
  const app = express();
  const handle = createService(repository);
  const auth = createAuth(authOptions);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', async (req, res) => {
    const result = auth.handle(req.method, req.originalUrl.split('?')[0], req.body, req.headers, req.socket.remoteAddress)
      || await handle(req.method, req.originalUrl.split('?')[0], req.body);
    res.set('Cache-Control', 'no-store');
    if (result.headers) res.set(result.headers);
    res.status(result.status).json(result.body);
  });
  app.get('/', (req, res) => res.redirect(auth.session(req.headers) ? '/index.html' : '/login.html'));
  app.get('/index.html', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!auth.session(req.headers)) return res.redirect('/login.html');
    next();
  });
  app.use(express.static(path.join(__dirname, '../public'), { index: false }));
  app.use((error, req, res, next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid JSON or request is too large.' }));
  return app;
}
async function start() {
  const repository = new MySQLRepository();
  try {
    const app = createApp(repository);
    await repository.ping();
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, '127.0.0.1', () => console.log('Exam seating: http://localhost:' + port + ' · MySQL'));
    server.on('error', async error => { console.error('Server could not start:', error.code); await repository.close(); process.exitCode = 1; });
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close(async () => { await repository.close(); }));
  } catch (error) {
    console.error('Startup failed. Check .env credentials and import database/schema.sql. ' + (error.code || error.message));
    await repository.close(); process.exitCode = 1;
  }
}
if (require.main === module) start();
module.exports = { createApp };
