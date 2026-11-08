'use strict';
const S = window.setup;
const $ = (id) => document.getElementById(id);

// Pixel heading in the player's Bloodrose-style letters.
(function title() {
  const G = { O: ".111.,11.11,11.11,11.11,11.11,11.11,11.11,11.11,.111.", N: "11..11,111.11,111.11,11.111,11.111,11..11,11..11,11..11,11..11", E: "11111,11..1,11...,11.1.,1111.,11.1.,11...,11..1,11111", "-": "....,....,....,....,1111,....,....,....,....", T: "111111,1.11.1,..11..,..11..,..11..,..11..,..11..,..11..,.1111.", I: "1111,.11.,.11.,.11.,.11.,.11.,.11.,.11.,1111", M: "11...11,111.111,1111111,11.1.11,11.1.11,11...11,11...11,11...11,11...11", S: ".1111,11..1,11...,111..,.111.,..111,...11,1..11,1111.", U: "11.11,11.11,11.11,11.11,11.11,11.11,11.11,11.11,.111.", P: "1111.,11.11,11.11,11.11,1111.,11...,11...,11...,111..", " ": "...,...,...,...,...,...,...,...,..." };
  const c = $('title'), g = c.getContext('2d'), str = 'ONE-TIME SETUP';
  let w = 0; for (const ch of str) w += G[ch].split(',')[0].length + 1; w -= 1;
  const draw = (ox, oy, col) => { let x = Math.floor((c.width - w) / 2) + ox; g.fillStyle = col; for (const ch of str) { const rows = G[ch].split(','); rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === '1') g.fillRect(x + i, 2 + y + oy, 1, 1); }); x += rows[0].length + 1; } };
  draw(1, 1, '#540c0c'); draw(0, 0, '#d44444');
})();

const show = (id) => { document.querySelectorAll('section').forEach((s) => s.classList.toggle('on', s.id === id)); const f = document.querySelector(`#${id} input`); if (f) setTimeout(() => f.focus(), 30); };
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
$('x').addEventListener('click', () => S.close());
$('skip').addEventListener('click', () => S.skip());
$('n-go').addEventListener('click', () => S.close());
if (new URLSearchParams(location.search).get('tool') === '0') show('notool');

const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };
const val = (id) => $(id).value.trim();

async function startSigning() {
  show('signing'); $('s-err').textContent = ''; $('s-retry').hidden = true; $('s-log').textContent = 'Starting…';
  const r = await S.sign();
  if (r.ok) { show('done'); setTimeout(() => S.restart(), 2500); }
  else { $('s-err').textContent = r.error; $('s-retry').hidden = false; }
}
S.onLog((line) => { $('s-log').textContent = line.replace(/^-\s*/, ''); });
$('s-go').addEventListener('click', startSigning);
$('d-go').addEventListener('click', () => S.restart());

$('c-go').addEventListener('click', async () => {
  const f = { email: val('c-email'), first: val('c-first'), last: val('c-last'), user: val('c-user'), pass: $('c-pass').value };
  const err = $('c-err');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { err.textContent = 'Enter a real email address. castLabs sends a code to it.'; $('c-email').focus(); return; }
  if (!f.first || !f.last) { err.textContent = 'Enter your first and last name.'; return; }
  if (!/^[A-Za-z0-9._-]{3,}$/.test(f.user)) { err.textContent = 'Pick a username of at least 3 letters or numbers, no spaces.'; $('c-user').focus(); return; }
  if (f.pass.length < 8) { err.textContent = 'The password needs at least 8 characters.'; $('c-pass').focus(); return; }
  err.textContent = ''; const b = $('c-go'); busy(b, true, 'Creating account…');
  const r = await S.signup(f);
  busy(b, false, 'Create account');
  if (r.ok) { $('k-email').textContent = f.email; show('code'); } else err.textContent = r.error;
});
['c-email', 'c-first', 'c-last', 'c-user', 'c-pass'].forEach((id) => $(id).addEventListener('input', () => { $('c-err').textContent = ''; }));

$('k-go').addEventListener('click', async () => {
  const code = val('k-code'), err = $('k-err');
  if (!/^\d{4,8}$/.test(code)) { err.textContent = 'Type the number from the email.'; return; }
  err.textContent = ''; const b = $('k-go'); busy(b, true, 'Confirming…');
  const r = await S.confirm(code);
  busy(b, false, 'Confirm and sign the app');
  if (r.ok) startSigning(); else err.textContent = r.error;
});
$('k-code').addEventListener('input', () => { $('k-err').textContent = ''; });
$('k-resend').addEventListener('click', async () => { $('k-err').textContent = 'Sending a new code…'; const r = await S.resend(); $('k-err').textContent = r.ok ? 'New code sent.' : r.error; });

$('l-go').addEventListener('click', async () => {
  const f = { user: val('l-user'), pass: $('l-pass').value }, err = $('l-err');
  if (!f.user || !f.pass) { err.textContent = 'Enter your castLabs username and password.'; return; }
  err.textContent = ''; const b = $('l-go'); busy(b, true, 'Signing in…');
  const r = await S.login(f);
  busy(b, false, 'Sign in and sign the app');
  if (r.ok) startSigning(); else err.textContent = r.error;
});
['l-user', 'l-pass'].forEach((id) => $(id).addEventListener('input', () => { $('l-err').textContent = ''; }));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const on = document.querySelector('section.on'); const b = on && on.querySelector('button.p'); if (b && !b.disabled) b.click();
});
