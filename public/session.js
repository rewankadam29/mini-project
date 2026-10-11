if (location.protocol === 'file:') location.replace('login.html');
async function checkAdminSession() {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.authenticated) { location.replace('/login.html'); return; }
    document.getElementById('adminName').textContent = result.user.username;
  } catch { location.replace('/login.html'); }
}
document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Logout failed');
    location.replace('/login.html');
  } catch { document.getElementById('adminName').textContent = 'Could not sign out. Check the server and retry.'; }
});
window.addEventListener('pageshow', checkAdminSession);
