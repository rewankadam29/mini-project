const crypto = require('node:crypto');

function createAuth(options = {}) {
  const username = options.username ?? process.env.ADMIN_USERNAME ?? 'admin';
  const password = options.password ?? process.env.ADMIN_PASSWORD ?? 'Admin@123';
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64);
  const sessions = new Map();
  const failures = new Map();
  const now = options.now ?? Date.now;
  const ttl = options.ttl ?? 8 * 60 * 60 * 1000;
  const cookieName = 'seating_admin';
  const demoCredentials = username === 'admin' && password === 'Admin@123';

  function token(headers = {}) {
    const cookie = headers.cookie || '';
    return cookie.split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }
  function session(headers) {
    const id = token(headers); const entry = sessions.get(id);
    if (!entry) return null;
    if (entry.expires <= now()) { sessions.delete(id); return null; }
    return { username: entry.username };
  }
  function cookie(id, seconds) {
    return `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
  }
  function handle(method, path, body, headers = {}, ip = 'local') {
    if (method !== 'GET' && headers.origin && headers.origin !== `http://${headers.host}` && headers.origin !== `https://${headers.host}`) return { status: 403, body: { error: 'Request origin is not allowed.' } };
    if (method === 'GET' && path === '/api/auth/session') return { status: 200, body: { authenticated: !!session(headers), user: session(headers), demoCredentials } };
    if (method === 'POST' && path === '/api/auth/login') {
      const previous = failures.get(ip);
      if (previous && previous.until > now() && previous.count >= 5) return { status: 429, body: { error: 'Too many incorrect attempts. Try again in 15 minutes.' } };
      const validInput = body && typeof body.username === 'string' && typeof body.password === 'string' && body.password.length <= 256 && body.username.length <= 100;
      const hash = crypto.scryptSync(validInput ? body.password : '', salt, 64);
      if (!validInput || body.username !== username || !crypto.timingSafeEqual(passwordHash, hash)) {
        const record = previous && previous.until > now() ? previous : { count: 0, until: now() + 15 * 60 * 1000 };
        record.count++; failures.set(ip, record);
        return { status: 401, body: { error: 'Incorrect username or password.' } };
      }
      failures.delete(ip);
      // Expired sessions are discarded whenever a new one is created.
      for (const [id, entry] of sessions) if (entry.expires <= now()) sessions.delete(id);
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
      sessions.delete(token(headers));
      const id = crypto.randomBytes(32).toString('hex');
      sessions.set(id, { username, expires: now() + ttl });
      return { status: 200, headers: { 'Set-Cookie': cookie(id, Math.floor(ttl / 1000)) }, body: { authenticated: true, user: { username } } };
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      sessions.delete(token(headers));
      return { status: 200, headers: { 'Set-Cookie': cookie('', 0) }, body: { authenticated: false } };
    }
    if (!session(headers)) return { status: 401, body: { error: 'Please sign in to access the admin dashboard.' } };
    return null;
  }
  return { handle, session };
}
module.exports = { createAuth };
