const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../backend/service');
const { DemoRepository } = require('../backend/repository');
const server = require('../backend/demo-server');
const request = { examName: 'CNS', examDate: '2026-10-12', examTime: '10:00', divisions: ['CE-A', 'CE-B', 'IT-A', 'EXTC-A'], rooms: ['101', '102', '103'], seatingType: 'shuffled' };

test('backend generates, validates, saves and retrieves a plan', async () => {
  const handle = createService(new DemoRepository());
  const result = await handle('POST', '/api/arrangements', request);
  assert.equal(result.status, 201); assert.equal(result.body.seats.length, 80);
  const saved = await handle('GET', `/api/arrangements/${result.body.planId}`);
  assert.deepEqual(saved.body, result.body);
});
test('invalid or infeasible requests never write a plan', async () => {
  const repo = new DemoRepository(); const handle = createService(repo);
  for (const invalid of [
    { ...request, examDate: '2026-02-31' }, { ...request, examName: ' ' },
    { ...request, rooms: ['999'] }, { ...request, rooms: ['101', '101'] },
    { ...request, rooms: ['101'] }, { ...request, divisions: ['CE-A'], rooms: ['101'] }
  ]) { const result = await handle('POST', '/api/arrangements', invalid); assert.ok(result.status >= 400); }
  assert.equal(repo.plans.size, 0);
});
test('storage failure returns 503 rather than a successful plan', async () => {
  const repo = new DemoRepository(); repo.save = async () => { throw new Error('Storage offline'); };
  const handle = createService(repo);
  assert.equal((await handle('POST', '/api/arrangements', request)).status, 503);
});
test('live zero-install HTTP adapter serves UI and both API strategies', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.match(await (await fetch(base)).text(), /loginForm/);
    assert.equal((await fetch(`${base}/api/catalog`)).status, 401);
    assert.equal((await fetch(`${base}/api/arrangements`, { method: 'POST', body: JSON.stringify(request) })).status, 401);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(await (await fetch(`${base}/index.html`, { headers: { cookie } })).text(), /Select All Classes/);
    const catalog = await (await fetch(`${base}/api/catalog`, { headers: { cookie } })).json(); assert.equal(catalog.students.length, 80);
    for (const seatingType of ['shuffled', 'column']) {
      const response = await fetch(`${base}/api/arrangements`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ ...request, seatingType }) });
      assert.equal(response.status, 201); assert.equal((await response.json()).validation.valid, true);
    }
    assert.equal((await fetch(`${base}/api/arrangements`, { method: 'POST', body: '{broken' })).status, 400);
    assert.equal((await fetch(`${base}/api/unknown`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/backend/repository.js`)).status, 404);
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/catalog`, { headers: { cookie } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
