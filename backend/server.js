const fs = require('node:fs');
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const express = require('express');
const path = require('node:path');
const { createRepository } = require('./repository');
const { createService } = require('./service');
const app = express();
const handle = createService(createRepository());
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', async (req, res) => {
  const result = await handle(req.method, req.originalUrl.split('?')[0], req.body);
  res.status(result.status).json(result.body);
});
app.use(express.static(path.join(__dirname, '../public')));
app.use((error, req, res, next) => res.status(400).json({ error: 'Invalid JSON or request is too large.' }));
const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(`Express server: http://localhost:${port} · DATA_SOURCE=${process.env.DATA_SOURCE || 'demo'}`));
