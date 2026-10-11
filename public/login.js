const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
function showError(text) { loginMessage.textContent = text; loginMessage.hidden = !text; }
document.getElementById('showPassword').addEventListener('click', () => {
  const password = document.getElementById('password');
  const show = password.type === 'password'; password.type = show ? 'text' : 'password';
  const button = document.getElementById('showPassword'); button.textContent = show ? 'Hide' : 'Show'; button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
async function checkSession() {
  if (location.protocol === 'file:') {
    showError('Start the project with npm.cmd run demo, then open http://localhost:3000 to sign in.');
    document.getElementById('signIn').disabled = true; return;
  }
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not connect to the login service.');
    const result = await response.json();
    if (result.authenticated) { location.replace('/index.html'); return; }
    document.getElementById('demoCredentials').hidden = !result.demoCredentials;
  } catch (error) { showError(`${error.message} Make sure the Node server is running.`); }
}
loginForm.addEventListener('submit', async event => {
  event.preventDefault(); if (!loginForm.reportValidity()) return;
  const button = document.getElementById('signIn'); button.disabled = true; button.textContent = 'Signing in...'; showError('');
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('username').value.trim(), password: document.getElementById('password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign in failed.');
    location.replace('/index.html');
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.textContent = 'Sign In'; }
});
checkSession();
