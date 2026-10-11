const fs = require('node:fs');
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const express = require('express');
const path = require('node:path');
const { createRepository } = require('./repository');
const { createService } = require('./service');
const { createAuth } = require('./auth');
const app = express();
const handle = createService(createRepository());
const auth = createAuth();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', async (req, res) => {
  const apiPath = req.originalUrl.split('?')[0];
  const result = auth.handle(req.method, apiPath, req.body, req.headers, req.socket.remoteAddress) || await handle(req.method, apiPath, req.body);
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
app.use(express.static(path.join(__dirname, '../public')));
app.use((error, req, res, next) => res.status(400).json({ error: 'Invalid JSON or request is too large.' }));
const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(`Express server: http://localhost:${port} · DATA_SOURCE=${process.env.DATA_SOURCE || 'demo'}`));
