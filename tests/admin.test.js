const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../backend/auth');
const selection = require('../public/js/selection');
const demo = require('./fixtures');

test('login rejects wrong passwords, accepts credentials, and expires sessions', () => {
  let time = 100; const auth = createAuth({ username: 'test', password: 'TestPassword123', now: () => time, ttl: 1000 });
  assert.equal(auth.handle('POST', '/api/auth/login', { username: 'test', password: 'wrong' }).status, 401);
  const login = auth.handle('POST', '/api/auth/login', { username: 'test', password: 'TestPassword123' });
  assert.equal(login.status, 200);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  assert.deepEqual(auth.session({ cookie }), { username: 'test' });
  assert.equal(auth.session({ cookie: 'seating_admin=forged' }), null);
  time = 1101; assert.equal(auth.session({ cookie }), null);
});
test('login throttles incorrect attempts and blocks foreign-origin mutations', () => {
  const auth = createAuth({ username: 'test', password: 'TestPassword123' });
  for (let i = 0; i < 5; i++) assert.equal(auth.handle('POST', '/api/auth/login', { username: 'test', password: 'wrong' }, {}, 'same-ip').status, 401);
  assert.equal(auth.handle('POST', '/api/auth/login', { username: 'test', password: 'TestPassword123' }, {}, 'same-ip').status, 429);
  assert.equal(auth.handle('POST', '/api/auth/logout', {}, { origin: 'http://another-site.example', host: 'localhost:3000' }).status, 403);
});
test('class search combines case-insensitive text and department filtering', () => {
  assert.equal(selection.matchesDivision('CE-A', ' ce ', 'CE'), true);
  assert.equal(selection.matchesDivision('CE-A', 'ce', 'IT'), false);
  assert.equal(selection.matchesDivision('IT-A', 'nothing', ''), false);
});
test('select shown preserves hidden selections while select all includes every class', () => {
  const all = ['CE-A', 'CE-B', 'IT-A', 'EXTC-A'];
  assert.deepEqual([...selection.bulkSelection(all, ['IT-A'], 'shown', ['CE-A', 'CE-B'])], ['IT-A', 'CE-A', 'CE-B']);
  assert.deepEqual([...selection.bulkSelection(all, ['IT-A'], 'all', ['CE-A'])], all);
  assert.equal(selection.bulkSelection(all, all, 'clear').size, 0);
});
test('selection summary totals the chosen students and rooms', () => {
  assert.deepEqual(selection.totals(demo.students, demo.rooms, ['CE-A', 'CE-B'], ['101', '102']), { students: 40, capacity: 60 });
  assert.deepEqual(selection.totals(demo.students, demo.rooms, [], []), { students: 0, capacity: 0 });
});
