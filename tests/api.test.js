const test = require('node:test');
const assert = require('node:assert/strict');

const { createService } = require('../backend/service');
const { DemoRepository } = require('../backend/repository');
const server = require('../backend/demo-server');

const request = {
  examName: 'CNS',
  examDate: '2026-10-12',
  examTime: '10:00',
  divisions: ['CE-A', 'CE-B', 'IT-A', 'EXTC-A'],
  rooms: ['101', '102', '103'],
  seatingType: 'shuffled'
};

test('backend generates, saves and retrieves a plan', async () => {
  const handle = createService(new DemoRepository());
  const result = await handle('POST', '/api/arrangements', request);

  assert.equal(result.status, 201);
  assert.equal(result.body.seats.length, 80);

  const saved = await handle(
    'GET',
    `/api/arrangements/${result.body.planId}`
  );

  assert.deepEqual(saved.body, result.body);
});

test('invalid requests never save a plan', async () => {
  const repository = new DemoRepository();
  const handle = createService(repository);

  const invalidRequests = [
    { ...request, examDate: '2026-02-31' },
    { ...request, examName: ' ' },
    { ...request, rooms: ['999'] },
    { ...request, rooms: ['101', '101'] },
    { ...request, rooms: ['101'] },
    { ...request, divisions: ['CE-A'], rooms: ['101'] }
  ];

  for (const invalid of invalidRequests) {
    const result = await handle(
      'POST',
      '/api/arrangements',
      invalid
    );

    assert.ok(result.status >= 400);
  }

  assert.equal(repository.plans.size, 0);
});

test('storage failure returns 503', async () => {
  const repository = new DemoRepository();

  repository.save = async () => {
    throw new Error('Storage offline');
  };

  const handle = createService(repository);
  const result = await handle('POST', '/api/arrangements', request);

  assert.equal(result.status, 503);
});

test('HTTP adapter protects routes and generates both strategies', async () => {
  await new Promise(resolve =>
    server.listen(0, '127.0.0.1', resolve)
  );

  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.match(await (await fetch(base)).text(), /loginForm/);

    assert.equal(
      (await fetch(`${base}/api/catalog`)).status,
      401
    );

    assert.equal(
      (
        await fetch(`${base}/api/arrangements`, {
          method: 'POST',
          body: JSON.stringify(request)
        })
      ).status,
      401
    );

    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'Admin@123'
      })
    });

    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);

    const cookie = login.headers.get('set-cookie').split(';')[0];

    const dashboard = await fetch(`${base}/index.html`, {
      headers: { cookie }
    });

    assert.match(await dashboard.text(), /Select All Classes/);

    const catalogResponse = await fetch(`${base}/api/catalog`, {
      headers: { cookie }
    });

    const catalog = await catalogResponse.json();
    assert.equal(catalog.students.length, 400);
    assert.equal(catalog.rooms.length, 20);

    for (const seatingType of ['shuffled', 'column']) {
      const response = await fetch(`${base}/api/arrangements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie
        },
        body: JSON.stringify({ ...request, seatingType })
      });

      assert.equal(response.status, 201);
      assert.equal((await response.json()).validation.valid, true);
    }

    assert.equal(
      (
        await fetch(`${base}/api/arrangements`, {
          method: 'POST',
          body: '{broken'
        })
      ).status,
      400
    );

    assert.equal(
      (
        await fetch(`${base}/api/unknown`, {
          headers: { cookie }
        })
      ).status,
      404
    );

    assert.equal(
      (await fetch(`${base}/backend/repository.js`)).status,
      404
    );

    assert.equal(
      (
        await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { cookie }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await fetch(`${base}/api/catalog`, {
          headers: { cookie }
        })
      ).status,
      401
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});