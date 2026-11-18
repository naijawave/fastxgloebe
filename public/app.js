'use strict';
const $ = (id) => document.getElementById(id);
const tokenKey = 'fxg_token';
let me = null;

function getToken() { return localStorage.getItem(tokenKey); }
function setToken(t) { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = getToken(); if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(path, { ...opts, headers });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { try { return new Date(d).toLocaleString(); } catch { return esc(d); } };

/* ---------- Sliders: auto-play only while on screen ---------- */
document.querySelectorAll('[data-slider]').forEach((slider) => {
  const track = slider.querySelector('.slides');
  const slides = slider.querySelectorAll('.slide');
  const dotsBox = slider.querySelector('.sDots');
  let idx = 0, timer = null;
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => go(i));
    dotsBox.appendChild(b);
  });
  const dots = dotsBox.querySelectorAll('button');
  function go(i) {
    idx = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    slides.forEach((s, j) => s.classList.toggle('active', j === idx));
    dots.forEach((d, j) => d.classList.toggle('active', j === idx));
  }
  function start() { if (!timer && slides.length > 1) timer = setInterval(() => go(idx + 1), 4600); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  slider.querySelector('.sPrev').addEventListener('click', () => go(idx - 1));
  slider.querySelector('.sNext').addEventListener('click', () => go(idx + 1));
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold: 0.25 }).observe(slider);
  } else start();
});

/* ---------- Stats: slow, professional count-up on scroll into view ---------- */
function animateCount(el) {
  const target = Number(el.dataset.target || 0);
  const suffix = el.dataset.suffix || '';
  const dur = 2400; // deliberately slow
  const t0 = performance.now();
  function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString() + (p === 1 ? suffix : '');
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const statsObs = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => {
  es.forEach(e => { if (e.isIntersecting) { animateCount(e.target); statsObs.unobserve(e.target); } });
}, { threshold: 0.4 }) : null;
document.querySelectorAll('.statNum').forEach(el => statsObs ? statsObs.observe(el) : animateCount(el));

/* ---------- Hamburger drawer (Change 8) ---------- */
const drawer = $('navDrawer'), drawerOverlay = $('drawerOverlay'), menuBtn = $('menuBtn');
function setDrawer(open) {
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  drawerOverlay.classList.toggle('hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
}
menuBtn.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
$('drawerClose').addEventListener('click', () => setDrawer(false));
drawerOverlay.addEventListener('click', () => setDrawer(false));
drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

/* ---------- Hero photo slideshow + live Dubai clock (Change 8) ---------- */
const heroSlides = document.querySelectorAll('.heroSlide');
const heroDots = document.querySelectorAll('.heroDots span');
let heroIdx = 0, heroTimer = null;
function heroGo(i) {
  heroIdx = (i + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((s, j) => s.classList.toggle('active', j === heroIdx));
  heroDots.forEach((d, j) => d.classList.toggle('active', j === heroIdx));
}
function heroStart() { if (!heroTimer && heroSlides.length > 1) heroTimer = setInterval(() => heroGo(heroIdx + 1), 5200); }
function heroStop() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }
if ('IntersectionObserver' in window && heroSlides.length > 1) {
  new IntersectionObserver((es) => es.forEach(e => e.isIntersecting ? heroStart() : heroStop()), { threshold: 0.2 }).observe(document.querySelector('.hero'));
} else heroStart();
function tickClock() {
  try {
    const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false });
    const dc = $('dubaiClock'), hc = $('heroClock');
    if (dc) dc.textContent = t + ' GST';
    if (hc) hc.textContent = t + ' GST';
  } catch { /* timezone unsupported — leave placeholder */ }
}
tickClock(); setInterval(tickClock, 1000);

/* ---------- Scroll-reveal (Change 8) ---------- */
const revealObs = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); revealObs.unobserve(e.target); } });
}, { threshold: 0.12 }) : null;
document.querySelectorAll('.reveal').forEach(el => revealObs ? revealObs.observe(el) : el.classList.add('revealed'));

/* ---------- Back to top (Change 8) ---------- */
const toTop = $('toTop');
window.addEventListener('scroll', () => {
  toTop.classList.toggle('hidden', window.scrollY < 600);
}, { passive: true });
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- NVOCC Read More ---------- */
$('nvoccToggle').addEventListener('click', () => {
  const more = $('nvoccMore');
  const open = more.classList.toggle('hidden');
  $('nvoccToggle').textContent = open ? 'Read More' : 'Read Less';
});

/* ---------- Where We Ship: See more / See less (Change 9) ---------- */
$('routesToggle').addEventListener('click', () => {
  const more = $('routesMore');
  const nowHidden = more.classList.toggle('hidden');
  $('routesToggle').textContent = nowHidden ? 'See more' : 'See less';
  $('routesToggle').setAttribute('aria-expanded', String(!nowHidden));
});

/* ---------- Consignment rendering + tracking map ---------- */
function consignmentHtml(c, { admin = false } = {}) {
  const events = (c.events || []).map(e => `
    <li><strong>${esc(e.status)}</strong> — ${esc(e.location || '')}
      ${e.note ? `<div>${esc(e.note)}</div>` : ''}
      <small>${fmtDate(e.created_at)}</small></li>`).join('');
  const custBtn = admin ? '' : `<p style="margin-top:.7rem"><button class="btn small primary custTrackBtn" type="button" data-code="${esc(c.tracking_number)}">📍 Track on map</button></p>`;
  let adminForm = '';
  if (admin) {
    adminForm = `
      <form class="form updForm" data-id="${esc(c.id)}" style="margin-top:.8rem">
        <label>New status
          <select name="status">
            ${['Received','In Transit','At Warehouse','Out for Delivery','Delivered','On Hold'].map(s =>
              `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select></label>
        <label>New location name <input name="location" value="${esc(c.current_location || '')}" required></label>
        <label>Note <input name="note" placeholder="Optional note for the customer"></label>
        <label>Place search (for the map pin) <input class="placeSearch" placeholder="e.g. Jebel Ali Port, Dubai"></label>
        <button class="btn searchBtn" type="button">Find place &amp; move pin</button>
        <div class="pickMap" id="pick-${esc(c.id)}"></div>
        <p class="muted small">Tap the map (or drag the pin) to place exactly where the goods are. The customer sees this pin when they track.</p>
        <input type="hidden" name="lat" value="${c.lat ?? ''}">
        <input type="hidden" name="lng" value="${c.lng ?? ''}">
        <button class="btn primary" type="submit">Update goods location</button>
        <button class="btn receiptBtn" type="button" data-id="${esc(c.id)}">Receipt 🧾</button>
        <p class="msg updMsg"></p>
      </form>`;
  }
  return `
  <div class="item">
    <h4>${esc(c.tracking_number)} <span class="badge">${esc(c.status)}</span></h4>
    <p><strong>Your goods are now at: ${esc(c.current_location || '—')}</strong></p>
    <p class="muted">
      ${c.origin ? `From: ${esc(c.origin)} · ` : ''}${c.destination ? `To: ${esc(c.destination)} · ` : ''}
      ${c.description ? `Goods: ${esc(c.description)} · ` : ''}${c.weight ? `Weight: ${esc(c.weight)} · ` : ''}
      ${c.customer_email ? `Customer: ${esc(c.customer_email)}` : ''}
    </p>
    ${events ? `<ul class="timeline">${events}</ul>` : ''}
    ${custBtn}
    ${adminForm}
  </div>`;
}

let trackMap = null, trackMarker = null;
async function showTrackMap(cons) {
  const wrap = $('trackMapWrap');
  if (!window.L) { wrap.classList.add('hidden'); return; }
  let lat = cons.lat, lng = cons.lng;
  if ((lat === null || lat === undefined) && cons.current_location) {
    // Fallback only: geocode the location name admin typed.
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(cons.current_location));
      const j = await r.json();
      if (j && j[0]) { lat = Number(j[0].lat); lng = Number(j[0].lon); }
    } catch { /* no map, timeline still shows */ }
  }
  if (lat === null || lat === undefined || lng === null || lng === undefined) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  if (!trackMap) {
    trackMap = L.map('trackMap');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18,
    }).addTo(trackMap);
  }
  trackMap.setView([lat, lng], 11);
  if (trackMarker) trackMarker.setLatLng([lat, lng]);
  else trackMarker = L.marker([lat, lng]).addTo(trackMap);
  trackMarker.bindPopup(`<strong>${esc(cons.tracking_number)}</strong><br>${esc(cons.current_location || '')}`).openPopup();
  setTimeout(() => trackMap.invalidateSize(), 60);
}

$('trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = $('trackResult');
  box.innerHTML = '<p class="muted">Searching…</p>';
  $('trackMapWrap').classList.add('hidden');
  try {
    const { consignment } = await api('/api/track/' + encodeURIComponent($('trackInput').value.trim()));
    box.innerHTML = `<div class="result">${consignmentHtml(consignment)}</div>`;
    showTrackMap(consignment);
  } catch (err) { box.innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
});

/* ---------- Support ---------- */
$('supportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('supportMsg'); msg.className = 'msg'; msg.textContent = 'Sending…';
  try {
    await api('/api/support', { method: 'POST', body: JSON.stringify({
      name: $('supName').value, email: $('supEmail').value,
      subject: $('supSubject').value, message: $('supMessage').value }) });
    msg.className = 'msg ok'; msg.textContent = 'Message sent. Support will reply to your email and in Messages.';
    e.target.reset(); if (me) { $('supEmail').value = me.email; loadMySupport(); }
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

/* ---------- Auth ---------- */
function setAuthMode(mode) {
  $('tabLogin').classList.toggle('active', mode === 'login');
  $('tabRegister').classList.toggle('active', mode === 'register');
  $('tabForgot').classList.toggle('active', mode === 'forgot');
  $('loginForm').classList.toggle('hidden', mode !== 'login');
  $('registerForm').classList.toggle('hidden', mode !== 'register');
  $('verifyForm').classList.toggle('hidden', true);
  $('forgotForm').classList.toggle('hidden', mode !== 'forgot');
  if (mode === 'register') $('verifyForm').classList.toggle('hidden', !$('verifyEmail').value);
}
$('tabLogin').addEventListener('click', () => setAuthMode('login'));
$('tabRegister').addEventListener('click', () => setAuthMode('register'));
$('tabForgot').addEventListener('click', () => setAuthMode('forgot'));

function authError(err) { $('authMsg').className = 'msg err'; $('authMsg').textContent = err.message; }
async function afterAuth(data) {
  setToken(data.token); me = data.user;
  $('authMsg').className = 'msg ok'; $('authMsg').textContent = 'Welcome, ' + me.name + '.';
  await refreshSessionUI();
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await afterAuth(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }) })); }
  catch (err) { authError(err); }
});
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({
      name: $('regName').value, email: $('regEmail').value, phone: $('regPhone').value, password: $('regPassword').value }) });
    $('verifyEmail').value = data.email;
    $('verifyForm').classList.remove('hidden');
    $('authMsg').className = 'msg ok';
    $('authMsg').textContent = 'Code sent to ' + data.email + '. Check your email app, then enter the code below.'
      + (data.dev_code ? ' (Dev mode only — your code is: ' + data.dev_code + ')' : '');
  } catch (err) { authError(err); }
});
$('verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await afterAuth(await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email: $('verifyEmail').value, code: $('verifyCode').value }) })); }
  catch (err) { authError(err); }
});
$('forgotSendBtn').addEventListener('click', async () => {
  try {
    const data = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: $('forgotEmail').value }) });
    $('authMsg').className = 'msg ok';
    $('authMsg').textContent = 'If that email has an account, a reset code is on its way to it.'
      + (data.dev_code ? ' (Dev mode only — your code is: ' + data.dev_code + ')' : '');
  } catch (err) { authError(err); }
});
$('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({
      email: $('forgotEmail').value, code: $('resetCode').value, newPassword: $('resetPassword').value }) });
    $('authMsg').className = 'msg ok'; $('authMsg').textContent = 'Password updated — you can now log in with your new password.';
    setAuthMode('login');
  } catch (err) { authError(err); }
});
$('navLogout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
  setToken(null); me = null; await refreshSessionUI();
  location.hash = '#home';
});

async function refreshSessionUI() {
  const loggedIn = !!getToken();
  if (loggedIn && !me) {
    try { me = (await api('/api/auth/me')).user; } catch { setToken(null); me = null; }
  }
  const isAdmin = !!(me && me.role === 'admin');
  $('navAdmin').classList.toggle('hidden', !isAdmin);
  $('admin').classList.toggle('hidden', !isAdmin);
  $('navLogout').classList.toggle('hidden', !me);
  $('authBox').classList.toggle('hidden', !!me);
  $('accountBox').classList.toggle('hidden', !me);
  refreshMessagesVisibility();
  if (me) {
    $('accountHello').innerHTML = `Logged in as <strong>${esc(me.name)}</strong> (${esc(me.email)})${isAdmin ? ' — <span class="badge">Admin</span>' : ''}`;
    $('supEmail').value = me.email; $('supName').value = me.name;
    $('pfName').value = me.name || ''; $('pfPhone').value = me.phone || ''; $('pfAddress').value = me.address || '';
    await loadMyConsignments(); await loadMySupport(); await loadMyChat();
    if (isAdmin) await loadAdmin();
  }
}

/* ---------- Profile ---------- */
$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('profileMsg');
  try {
    const { user } = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({
      name: $('pfName').value, phone: $('pfPhone').value, address: $('pfAddress').value }) });
    me = user; msg.className = 'msg ok'; msg.textContent = 'Profile saved.';
    $('accountHello').innerHTML = `Logged in as <strong>${esc(me.name)}</strong> (${esc(me.email)})`;
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});
$('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('pwMsg');
  try {
    await api('/api/profile/change-password', { method: 'POST', body: JSON.stringify({
      currentPassword: $('pwCurrent').value, newPassword: $('pwNew').value }) });
    msg.className = 'msg ok'; msg.textContent = 'Password changed.'; e.target.reset();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

/* ---------- Customer data ---------- */
async function loadMyConsignments() {
  try {
    const { consignments } = await api('/api/my/consignments');
    $('myConsignments').innerHTML = consignments.length
      ? consignments.map(c => consignmentHtml(c)).join('')
      : '<p class="muted">No consignments yet. When a shipment is booked for you, it will appear here.</p>';
  } catch (err) { $('myConsignments').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}
function supportHtml(m, { admin = false } = {}) {
  return `<div class="item">
    <h4>${esc(m.subject || '(no subject)')} <span class="badge">${esc(m.status)}</span></h4>
    <p>${esc(m.message)}</p>
    <p class="muted">From: ${esc(m.name || '')} ${esc(m.email)} · ${fmtDate(m.created_at)}</p>
    ${m.admin_reply ? `<div class="reply"><strong>Support reply:</strong><br>${esc(m.admin_reply)}</div>` : ''}
    ${admin ? `
      <form class="form repForm" data-id="${esc(m.id)}" style="margin-top:.7rem">
        <label>Reply <textarea name="reply" rows="2" required></textarea></label>
        <button class="btn primary" type="submit">Send reply</button>
        <button class="btn danger closeBtn" type="button" data-id="${esc(m.id)}">Close ticket</button>
        <p class="msg repMsg"></p>
      </form>` : ''}
  </div>`;
}
async function loadMySupport() {
  try {
    const { messages } = await api('/api/my/support');
    $('mySupport').innerHTML = messages.length
      ? messages.map(m => supportHtml(m)).join('')
      : '<p class="muted">No support messages yet.</p>';
  } catch (err) { $('mySupport').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}
function chatMsgHtml(m, viewerRole) {
  const mine = m.sender_role === viewerRole;
  const who = m.sender_role === 'admin' ? 'fastxgloebe team' : (m.customer_name || 'Customer');
  return `<div class="chatBubble ${mine ? 'mine' : 'theirs'}"><strong>${esc(who)}:</strong> ${esc(m.message)}<small>${fmtDate(m.created_at)}</small></div>`;
}
async function loadMyChat() {
  try {
    const { messages } = await api('/api/my/chat');
    $('chatThread').innerHTML = messages.length
      ? messages.map(m => chatMsgHtml(m, 'customer')).join('')
      : '<p class="muted">No chat yet. Write to us below — we reply here.</p>';
    $('chatThread').scrollTop = $('chatThread').scrollHeight;
  } catch (err) { $('chatThread').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}
$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/my/chat', { method: 'POST', body: JSON.stringify({ message: $('chatInput').value }) });
    $('chatInput').value = '';
    await loadMyChat();
  } catch (err) { alert(err.message); }
});

/* ---------- Admin ---------- */
let adminConsignments = [];
async function loadAdmin() {
  try {
    const { stats } = await api('/api/admin/stats');
    $('adminStats').innerHTML = [
      ['Consignments', stats.consignments], ['In transit', stats.in_transit],
      ['Delivered', stats.delivered], ['Customers', stats.customers],
      ['Open support', stats.open_support], ['Chat threads', stats.chat_threads ?? 0],
    ].map(([k, v]) => `<div class="stat"><b>${v}</b>${k}</div>`).join('');

    const { consignments } = await api('/api/admin/consignments');
    adminConsignments = consignments;
    $('adminConsignments').innerHTML = consignments.length
      ? consignments.map(c => consignmentHtml(c, { admin: true })).join('')
      : '<p class="muted">No consignments yet. Book the first package above.</p>';
    bindAdminConsignmentForms();

    const { threads } = await api('/api/admin/chat');
    $('adminChat').innerHTML = threads.length
      ? threads.map(t => `
        <div class="item">
          <h4>${esc(t.customer_name || t.customer_email)} <span class="badge">${esc(t.customer_email)}</span></h4>
          <div class="chatThread">${t.messages.map(m => chatMsgHtml(m, 'admin')).join('')}</div>
          <form class="form chatRepForm" data-email="${esc(t.customer_email)}">
            <label>Reply <input name="message" required placeholder="Write a reply to this customer…"></label>
            <button class="btn primary" type="submit">Send reply</button>
            <p class="msg chatRepMsg"></p>
          </form>
        </div>`).join('')
      : '<p class="muted">No customer chats yet.</p>';
    bindAdminChatForms();

    const { messages } = await api('/api/admin/support');
    $('adminSupport').innerHTML = messages.length
      ? messages.map(m => supportHtml(m, { admin: true })).join('')
      : '<p class="muted">No support messages yet.</p>';
    bindAdminSupportForms();

    const { customers } = await api('/api/admin/customers');
    $('adminCustomers').innerHTML = customers.length
      ? customers.map(u => `<div class="item"><strong>${esc(u.name)}</strong> — ${esc(u.email)} <span class="badge">${esc(u.role)}</span>${u.phone ? `<br><small class="muted">Phone: ${esc(u.phone)}</small>` : ''}<br><small class="muted">Joined ${fmtDate(u.created_at)}</small></div>`).join('')
      : '<p class="muted">No registered users yet.</p>';
  } catch (err) {
    $('adminStats').innerHTML = `<p class="msg err">${esc(err.message)}</p>`;
  }
}

function initPickMap(form, cons) {
  const div = form.querySelector('.pickMap');
  if (!div || !window.L) return;
  const start = (cons.lat !== null && cons.lat !== undefined) ? [cons.lat, cons.lng] : [25.2048, 55.2708]; // Dubai default
  const map = L.map(div).setView(start, (cons.lat !== null && cons.lat !== undefined) ? 11 : 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 18,
  }).addTo(map);
  const marker = L.marker(start, { draggable: true }).addTo(map);
  const latIn = form.querySelector('input[name="lat"]');
  const lngIn = form.querySelector('input[name="lng"]');
  function place(ll) { latIn.value = ll.lat.toFixed(6); lngIn.value = ll.lng.toFixed(6); }
  if (cons.lat !== null && cons.lat !== undefined) place({ lat: cons.lat, lng: cons.lng });
  map.on('click', (e) => { marker.setLatLng(e.latlng); place(e.latlng); });
  marker.on('dragend', () => place(marker.getLatLng()));
  form.querySelector('.searchBtn').addEventListener('click', async () => {
    const q = form.querySelector('.placeSearch').value.trim();
    if (!q) return;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
      const j = await r.json();
      if (j && j[0]) {
        const ll = { lat: Number(j[0].lat), lng: Number(j[0].lon) };
        marker.setLatLng(ll); map.setView(ll, 12); place(ll);
        const locIn = form.querySelector('input[name="location"]');
        if (locIn && !locIn.value) locIn.value = q;
      } else alert('Place not found — tap the map to place the pin instead.');
    } catch { alert('Search failed — tap the map to place the pin instead.'); }
  });
  setTimeout(() => map.invalidateSize(), 80);
}

function bindAdminConsignmentForms() {
  document.querySelectorAll('.updForm').forEach(f => {
    const cons = adminConsignments.find(c => c.id === f.dataset.id);
    if (cons) initPickMap(f, cons);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.updMsg');
      try {
        const fd = new FormData(f);
        const body = { status: fd.get('status'), location: fd.get('location'), note: fd.get('note') };
        if (fd.get('lat')) { body.lat = Number(fd.get('lat')); body.lng = Number(fd.get('lng')); }
        await api('/api/admin/consignments/' + encodeURIComponent(f.dataset.id) + '/location', {
          method: 'POST', body: JSON.stringify(body) });
        msg.className = 'msg ok'; msg.textContent = 'Location updated — the customer tracking and map now show this.';
        await loadAdmin();
      } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    });
    const rb = f.querySelector('.receiptBtn');
    if (rb) rb.addEventListener('click', () => openReceipt(rb.dataset.id));
  });
}
function bindAdminSupportForms() {
  document.querySelectorAll('.repForm').forEach(f => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.repMsg');
      try {
        await api('/api/admin/support/' + encodeURIComponent(f.dataset.id) + '/reply', {
          method: 'POST', body: JSON.stringify({ reply: new FormData(f).get('reply') }) });
        msg.className = 'msg ok'; msg.textContent = 'Reply sent.';
        await loadAdmin();
      } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    });
  });
  document.querySelectorAll('.closeBtn').forEach(b => {
    b.addEventListener('click', async () => {
      try { await api('/api/admin/support/' + encodeURIComponent(b.dataset.id) + '/close', { method: 'POST', body: '{}' }); await loadAdmin(); }
      catch (err) { alert(err.message); }
    });
  });
}
function bindAdminChatForms() {
  document.querySelectorAll('.chatRepForm').forEach(f => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.chatRepMsg');
      try {
        await api('/api/admin/chat/' + encodeURIComponent(f.dataset.email) + '/reply', {
          method: 'POST', body: JSON.stringify({ message: new FormData(f).get('message') }) });
        msg.className = 'msg ok'; msg.textContent = 'Reply sent.';
        await loadAdmin();
      } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
    });
  });
}
$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('createMsg'); msg.className = 'msg'; msg.textContent = 'Booking…';
  try {
    const { consignment } = await api('/api/admin/consignments', { method: 'POST', body: JSON.stringify({
      customerEmail: $('cEmail').value, customerName: $('cName').value, senderName: $('cSender').value,
      origin: $('cOrigin').value, destination: $('cDest').value, weight: $('cWeight').value,
      description: $('cDesc').value, status: $('cStatus').value, currentLocation: $('cLocation').value, note: $('cNote').value }) });
    msg.className = 'msg ok';
    msg.textContent = 'Booked. Tracking number: ' + consignment.tracking_number + ' — a receipt was created with it (use the Receipt button on the consignment below). Give the tracking number to the customer.';
    e.target.reset(); await loadAdmin();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

/* ---------- Receipt ---------- */
let currentReceiptId = null;
function renderReceiptCard(r) {
  const row = (k, v) => v ? `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>` : '';
  $('receiptCard').innerHTML = `
    <div class="receiptHead">
      <div><div class="rBrand">fastx<span>gloebe</span></div>
      <small>Freight Forwarding &amp; Haulage · Dubai, United Arab Emirates<br>info@fastxgloebe.com · +971 4 524 8091</small></div>
      <div class="receiptTitle"><h2>RECEIPT</h2><small>Tracking: <strong>${esc(r.tracking_number || '')}</strong><br>Date: ${esc(r.date || '')}</small></div>
    </div>
    <div class="receiptRows">
      ${row('Sender', r.sender_name)}${row('Receiver', r.receiver_name)}
      ${row('Receiver email', r.receiver_email)}${row('Tracking code', r.tracking_number)}
      ${row('Origin', r.origin)}${row('Destination', r.destination)}
      ${row('Description', r.description)}${row('Weight', r.weight)}
      ${row('Pieces', r.pieces)}${row('Charges', r.charges)}
    </div>
    ${r.note ? `<p><strong>Note:</strong> ${esc(r.note)}</p>` : ''}
    <div class="receiptTotal"><span>TOTAL</span><span>${esc(r.currency || 'USD')} ${esc(r.total || '—')}</span></div>
    <p class="receiptFoot">Thank you for shipping with fastxgloebe. Track your goods any time with the tracking code above. This receipt was issued for the booking shown — please keep it safe.</p>`;
}
async function openReceipt(id) {
  try {
    const { receipt } = await api('/api/admin/consignments/' + encodeURIComponent(id) + '/receipt');
    currentReceiptId = id;
    $('rSender').value = receipt.sender_name || ''; $('rReceiver').value = receipt.receiver_name || '';
    $('rEmail').value = receipt.receiver_email || ''; $('rOrigin').value = receipt.origin || '';
    $('rDest').value = receipt.destination || ''; $('rDesc').value = receipt.description || '';
    $('rWeight').value = receipt.weight || ''; $('rPieces').value = receipt.pieces || '';
    $('rCharges').value = receipt.charges || ''; $('rTotal').value = receipt.total || '';
    $('rCurrency').value = receipt.currency || 'USD'; $('rDate').value = receipt.date || '';
    $('rNote').value = receipt.note || '';
    renderReceiptCard(receipt);
    $('mainView').classList.add('hidden');
    $('siteFooter').classList.add('hidden');
    $('trackView').classList.add('hidden');
    $('messagesView').classList.add('hidden');
    $('receiptView').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch (err) { alert(err.message); }
}
function closeReceipt() {
  showMainView();
  location.hash = '#admin';
}
$('receiptBack').addEventListener('click', closeReceipt);
$('receiptPrint').addEventListener('click', () => window.print());
$('receiptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('receiptMsg');
  try {
    const { receipt } = await api('/api/admin/consignments/' + encodeURIComponent(currentReceiptId) + '/receipt', {
      method: 'PUT', body: JSON.stringify({
        sender_name: $('rSender').value, receiver_name: $('rReceiver').value, receiver_email: $('rEmail').value,
        origin: $('rOrigin').value, destination: $('rDest').value, description: $('rDesc').value,
        weight: $('rWeight').value, pieces: $('rPieces').value, charges: $('rCharges').value,
        total: $('rTotal').value, currency: $('rCurrency').value, date: $('rDate').value, note: $('rNote').value }) });
    renderReceiptCard(receipt);
    msg.className = 'msg ok'; msg.textContent = 'Receipt saved. You can now print it or screenshot the receipt card.';
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

/* ---------- Dedicated views: Track + Messages (Change 10) ---------- */
function showMainView() {
  $('trackView').classList.add('hidden');
  $('messagesView').classList.add('hidden');
  $('receiptView').classList.add('hidden');
  $('mainView').classList.remove('hidden');
  $('siteFooter').classList.remove('hidden');
}
function refreshMessagesVisibility() {
  const hint = $('messagesLoginHint'), body = $('messagesBody');
  if (!hint || !body) return;
  hint.classList.toggle('hidden', !!me);
  body.classList.toggle('hidden', !me);
}
function openView(view) {
  $('mainView').classList.add('hidden');
  $('siteFooter').classList.add('hidden');
  $('receiptView').classList.add('hidden');
  $('trackView').classList.toggle('hidden', view !== 'track');
  $('messagesView').classList.toggle('hidden', view !== 'messages');
  window.scrollTo(0, 0);
  if (view === 'messages') {
    refreshMessagesVisibility();
    if (me) { loadMyChat(); loadMySupport(); }
  }
}
function goView(view) {
  openView(view);
  history.pushState(null, '', view === 'track' ? '#track' : '#messages');
}
document.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); goView(a.dataset.open); }));
$('topTrackBtn').addEventListener('click', () => goView('track'));
$('trackBack').addEventListener('click', () => { showMainView(); history.pushState(null, '', '#home'); });
$('messagesBack').addEventListener('click', () => { showMainView(); history.pushState(null, '', '#home'); });
$('messagesLoginBtn').addEventListener('click', () => { showMainView(); location.hash = '#account'; });
$('accountMessagesBtn').addEventListener('click', () => goView('messages'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('.custTrackBtn');
  if (!b) return;
  goView('track');
  $('trackInput').value = b.dataset.code || '';
  const f = $('trackForm');
  if (f.requestSubmit) f.requestSubmit();
  else f.dispatchEvent(new Event('submit', { cancelable: true }));
});
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (h === '#track') return openView('track');
  if (h === '#messages') return openView('messages');
  const viewOpen = !$('trackView').classList.contains('hidden') || !$('messagesView').classList.contains('hidden') || !$('receiptView').classList.contains('hidden');
  if (viewOpen) {
    showMainView();
    if (h && h.length > 1) {
      const el = document.getElementById(h.slice(1));
      if (el) setTimeout(() => el.scrollIntoView(), 40);
    } else window.scrollTo(0, 0);
  }
});

/* ---------- Boot ---------- */
refreshSessionUI();
if (location.hash === '#track') openView('track');
else if (location.hash === '#messages') openView('messages');
