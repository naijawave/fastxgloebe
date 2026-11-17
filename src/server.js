'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createStore } = require('./store');
const { sendCodeEmail, OTP_LIVE } = require('./email');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me-fastxgloebe';
if (!process.env.JWT_SECRET) {
  console.warn('[fastxgloebe] WARNING: JWT_SECRET is not set — using a dev fallback. Set JWT_SECRET in production (Render generates it from render.yaml).');
}

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

let store;
const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  phone: u.phone || '', address: u.address || '', created_at: u.created_at,
});
const normEmail = (e) => String(e || '').trim().toLowerCase();
const genTracking = () => 'FXG-' + String(crypto.randomInt(10000000, 99999999));
const genCode = () => String(crypto.randomInt(100000, 999999)); // 6-digit email code
const CODE_TTL_MS = 15 * 60 * 1000;
const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v); return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
};
const latOrNull = (v) => { const n = numOrNull(v); return n !== null && n >= -90 && n <= 90 ? n : null; };

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}
function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });
  try { req.user = jwt.verify(token, JWT_SECRET); return next(); }
  catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  return next();
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Auth: register -> email code -> verified account ----------
 * Registration does NOT create the account immediately. It stores a
 * pending registration + 6-digit code and emails the code to the user's
 * real email. Only a verified code creates the account.
 * FIRST-ACCOUNT RULE: the first VERIFIED account created on a fresh
 * database becomes admin; every later verified account is a customer.
 * (Pending/unverified registrations never consume the admin slot.)
 */
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim();
  if (!name || !email || !email.includes('@')) return res.status(400).json({ error: 'Name and a valid email are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (await store.getUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  const password_hash = await bcrypt.hash(password, 10);
  const code = genCode();
  await store.saveAuthCode({
    email, purpose: 'register', code,
    payload: { name, password_hash, phone },
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  const sent = await sendCodeEmail(email, code, 'register');
  return res.status(201).json({
    pending: true, email,
    message: 'Verification code sent to your email. Enter it to finish creating your account.',
    ...(sent.live ? {} : { dev_code: sent.dev_code }),
  });
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const rec = await store.getAuthCode(email, 'register');
  if (!rec) return res.status(400).json({ error: 'No pending registration for this email. Please register again.' });
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await store.deleteAuthCode(rec.id);
    return res.status(400).json({ error: 'That code has expired. Please register again to get a new one.' });
  }
  if (String(rec.code) !== code) return res.status(400).json({ error: 'Wrong code. Check your email and try again.' });
  const payload = typeof rec.payload === 'string' ? JSON.parse(rec.payload) : (rec.payload || {});
  if (await store.getUserByEmail(email)) {
    await store.deleteAuthCode(rec.id);
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }
  const count = await store.countUsers();
  const role = count === 0 ? 'admin' : 'customer'; // FIRST verified account becomes admin
  const user = await store.createUser({
    name: payload.name, email, password_hash: payload.password_hash, role,
    phone: payload.phone || '', verified: true,
  });
  await store.deleteAuthCode(rec.id);
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/resend-code', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const rec = await store.getAuthCode(email, 'register');
  if (!rec) return res.status(400).json({ error: 'No pending registration for this email.' });
  const code = genCode();
  await store.saveAuthCode({
    email, purpose: 'register', code, payload: rec.payload,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  const sent = await sendCodeEmail(email, code, 'register');
  return res.json({ pending: true, email, message: 'A new code was sent to your email.', ...(sent.live ? {} : { dev_code: sent.dev_code }) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await store.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  if (user.verified === false) return res.status(403).json({ error: 'Please verify your email before logging in.' });
  return res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/forgot', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const user = email ? await store.getUserByEmail(email) : null;
  // Generic response either way (do not reveal whether an account exists),
  // but only real accounts get a code.
  if (user) {
    const code = genCode();
    await store.saveAuthCode({
      email, purpose: 'reset', code, payload: {},
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    const sent = await sendCodeEmail(email, code, 'reset');
    return res.json({
      ok: true, message: 'If an account exists for this email, a reset code has been sent to it.',
      ...(sent.live ? {} : { dev_code: sent.dev_code }),
    });
  }
  return res.json({ ok: true, message: 'If an account exists for this email, a reset code has been sent to it.' });
}));

app.post('/api/auth/reset', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.newPassword || req.body.password || '');
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const rec = await store.getAuthCode(email, 'reset');
  if (!rec) return res.status(400).json({ error: 'No reset code was requested for this email.' });
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await store.deleteAuthCode(rec.id);
    return res.status(400).json({ error: 'That code has expired. Please request a new one.' });
  }
  if (String(rec.code) !== code) return res.status(400).json({ error: 'Wrong code. Check your email and try again.' });
  const user = await store.getUserByEmail(email);
  if (!user) { await store.deleteAuthCode(rec.id); return res.status(400).json({ error: 'Account not found.' }); }
  await store.updateUser(user.id, { password_hash: await bcrypt.hash(newPassword, 10) });
  await store.deleteAuthCode(rec.id);
  return res.json({ ok: true, message: 'Password updated. You can now log in with your new password.' });
}));

app.post('/api/auth/logout', (req, res) => res.json({ ok: true })); // JWT is stateless; client clears it

app.get('/api/auth/me', authRequired, wrap(async (req, res) => {
  const user = await store.getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  return res.json({ user: publicUser(user) });
}));

/* ---------- Profile ---------- */
app.patch('/api/profile', authRequired, wrap(async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.phone !== undefined) patch.phone = String(req.body.phone).trim();
  if (req.body.address !== undefined) patch.address = String(req.body.address).trim();
  if (patch.name !== undefined && !patch.name) return res.status(400).json({ error: 'Name cannot be empty.' });
  const user = await store.updateUser(req.user.id, patch);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ user: publicUser(user) });
}));

app.post('/api/profile/change-password', authRequired, wrap(async (req, res) => {
  const user = await store.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (!(await bcrypt.compare(current, user.password_hash))) return res.status(401).json({ error: 'Current password is wrong.' });
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  await store.updateUser(user.id, { password_hash: await bcrypt.hash(next, 10) });
  return res.json({ ok: true, message: 'Password changed.' });
}));

/* ---------- Public tracking ---------- */
async function consignmentWithEvents(cons) {
  const events = await store.listTrackingEvents(cons.id);
  return { ...cons, events };
}
app.get('/api/track/:tracking', wrap(async (req, res) => {
  const tracking = String(req.params.tracking || '').trim().toUpperCase();
  const cons = await store.getConsignmentByTracking(tracking);
  if (!cons) return res.status(404).json({ error: 'No consignment found with that tracking number.' });
  return res.json({ consignment: await consignmentWithEvents(cons) });
}));

/* ---------- Customer ---------- */
app.get('/api/my/consignments', authRequired, wrap(async (req, res) => {
  const list = await store.listConsignmentsByCustomerEmail(normEmail(req.user.email));
  const withEvents = await Promise.all(list.map(consignmentWithEvents));
  return res.json({ consignments: withEvents });
}));
app.get('/api/my/support', authRequired, wrap(async (req, res) => {
  const messages = await store.listSupportMessagesByEmail(normEmail(req.user.email));
  return res.json({ messages });
}));

/* Customer <-> admin chat */
app.get('/api/my/chat', authRequired, wrap(async (req, res) => {
  const messages = await store.listChatMessagesByEmail(normEmail(req.user.email));
  return res.json({ messages });
}));
app.post('/api/my/chat', authRequired, wrap(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message cannot be empty.' });
  const user = await store.getUserById(req.user.id);
  const saved = await store.createChatMessage({
    customer_email: normEmail(req.user.email),
    customer_name: user ? user.name : '',
    sender_role: 'customer', message,
  });
  return res.status(201).json({ message: saved });
}));

/* ---------- Support (guest or logged in) -> Admin Support Inbox ---------- */
app.post('/api/support', wrap(async (req, res) => {
  let { name, email } = req.body;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try { const u = jwt.verify(h.slice(7), JWT_SECRET); email = u.email; } catch { /* treat as guest */ }
  }
  email = normEmail(email);
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  name = String(name || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required so support can reply to you.' });
  if (!message) return res.status(400).json({ error: 'Please write your message.' });
  const saved = await store.createSupportMessage({ name, email, subject, message });
  return res.status(201).json({ message: saved });
}));

/* ---------- Admin ---------- */
app.get('/api/admin/stats', authRequired, adminRequired, wrap(async (req, res) => {
  const [consignments, users, support, chat] = await Promise.all([
    store.listConsignments(), store.listUsers(), store.listSupportMessages(), store.listAllChatMessages(),
  ]);
  return res.json({
    stats: {
      consignments: consignments.length,
      in_transit: consignments.filter(c => /transit/i.test(c.status)).length,
      delivered: consignments.filter(c => /delivered/i.test(c.status)).length,
      customers: users.filter(u => u.role !== 'admin').length,
      users: users.length,
      open_support: support.filter(m => m.status === 'open').length,
      chat_threads: new Set(chat.map(m => m.customer_email)).size,
    },
  });
}));

app.get('/api/admin/consignments', authRequired, adminRequired, wrap(async (req, res) => {
  const list = await store.listConsignments();
  const withEvents = await Promise.all(list.map(consignmentWithEvents));
  return res.json({ consignments: withEvents });
}));

function defaultReceipt(cons) {
  return {
    sender_name: cons.sender_name || '',
    receiver_name: cons.customer_name || '',
    receiver_email: cons.customer_email || '',
    origin: cons.origin || '',
    destination: cons.destination || '',
    description: cons.description || '',
    weight: cons.weight || '',
    pieces: '',
    charges: '',
    total: '',
    currency: 'USD',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  };
}

app.post('/api/admin/consignments', authRequired, adminRequired, wrap(async (req, res) => {
  const customer_email = normEmail(req.body.customerEmail || req.body.customer_email);
  if (!customer_email || !customer_email.includes('@')) return res.status(400).json({ error: 'Customer email is required.' });
  const status = String(req.body.status || 'Received').trim() || 'Received';
  const current_location = String(req.body.currentLocation || req.body.current_location || req.body.origin || '').trim();
  const lat = latOrNull(req.body.lat); const lng = numOrNull(req.body.lng);
  let tracking_number = genTracking();
  for (let i = 0; i < 5 && (await store.getConsignmentByTracking(tracking_number)); i++) tracking_number = genTracking();
  const base = {
    tracking_number,
    customer_email,
    customer_name: String(req.body.customerName || '').trim(),
    sender_name: String(req.body.senderName || '').trim(),
    origin: String(req.body.origin || '').trim(),
    destination: String(req.body.destination || '').trim(),
    description: String(req.body.description || '').trim(),
    weight: String(req.body.weight || '').trim(),
    status,
    current_location,
    note: String(req.body.note || '').trim(),
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
  };
  // Booking auto-generates the tracking code AND its receipt together.
  base.receipt = defaultReceipt(base);
  const cons = await store.createConsignment(base,
    { status, location: current_location, note: String(req.body.note || 'Consignment received').trim(), lat: base.lat, lng: base.lng });
  return res.status(201).json({ consignment: await consignmentWithEvents(cons) });
}));

async function handleLocationUpdate(req, res) {
  const existing = await store.getConsignmentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Consignment not found.' });
  const status = String(req.body.status || existing.status).trim();
  const current_location = String(req.body.location || req.body.currentLocation || req.body.current_location || existing.current_location).trim();
  const note = req.body.note !== undefined ? String(req.body.note).trim() : undefined;
  // Admin-placed map pin: accept explicit lat/lng; keep the old pin when omitted.
  let lat = existing.lat ?? null; let lng = existing.lng ?? null;
  if (req.body.lat !== undefined || req.body.lng !== undefined) {
    lat = latOrNull(req.body.lat); lng = numOrNull(req.body.lng);
    if (lat === null || lng === null) { lat = null; lng = null; }
  }
  const updated = await store.updateConsignmentLocation(existing.id,
    { status, current_location, note, lat, lng },
    { status, location: current_location, note: note || '', lat, lng });
  return res.json({ consignment: await consignmentWithEvents(updated) });
}
app.post('/api/admin/consignments/:id/location', authRequired, adminRequired, wrap(handleLocationUpdate));
app.patch('/api/admin/consignments/:id/location', authRequired, adminRequired, wrap(handleLocationUpdate));

/* Receipt: admin fills it, then opens a clean screenshot-ready view */
app.get('/api/admin/consignments/:id/receipt', authRequired, adminRequired, wrap(async (req, res) => {
  const cons = await store.getConsignmentById(req.params.id);
  if (!cons) return res.status(404).json({ error: 'Consignment not found.' });
  const receipt = { ...defaultReceipt(cons), ...(cons.receipt || {}), tracking_number: cons.tracking_number };
  return res.json({ receipt, consignment: cons });
}));
app.put('/api/admin/consignments/:id/receipt', authRequired, adminRequired, wrap(async (req, res) => {
  const cons = await store.getConsignmentById(req.params.id);
  if (!cons) return res.status(404).json({ error: 'Consignment not found.' });
  const b = req.body || {};
  const receipt = {
    sender_name: String(b.sender_name ?? b.senderName ?? cons.sender_name ?? '').trim(),
    receiver_name: String(b.receiver_name ?? b.receiverName ?? cons.customer_name ?? '').trim(),
    receiver_email: String(b.receiver_email ?? b.receiverEmail ?? cons.customer_email ?? '').trim(),
    origin: String(b.origin ?? cons.origin ?? '').trim(),
    destination: String(b.destination ?? cons.destination ?? '').trim(),
    description: String(b.description ?? cons.description ?? '').trim(),
    weight: String(b.weight ?? cons.weight ?? '').trim(),
    pieces: String(b.pieces ?? '').trim(),
    charges: String(b.charges ?? '').trim(),
    total: String(b.total ?? '').trim(),
    currency: String(b.currency ?? 'USD').trim() || 'USD',
    date: String(b.date ?? new Date().toISOString().slice(0, 10)).trim(),
    note: String(b.note ?? '').trim(),
  };
  const updated = await store.updateConsignmentReceipt(cons.id, receipt);
  return res.json({ receipt: { ...receipt, tracking_number: updated.tracking_number }, consignment: updated });
}));
app.post('/api/admin/consignments/:id/receipt', authRequired, adminRequired, wrap(async (req, res) => {
  // POST alias of PUT for clients that prefer POST
  req.method = 'PUT';
  const cons = await store.getConsignmentById(req.params.id);
  if (!cons) return res.status(404).json({ error: 'Consignment not found.' });
  const b = req.body || {};
  const receipt = {
    sender_name: String(b.sender_name ?? b.senderName ?? cons.sender_name ?? '').trim(),
    receiver_name: String(b.receiver_name ?? b.receiverName ?? cons.customer_name ?? '').trim(),
    receiver_email: String(b.receiver_email ?? b.receiverEmail ?? cons.customer_email ?? '').trim(),
    origin: String(b.origin ?? cons.origin ?? '').trim(),
    destination: String(b.destination ?? cons.destination ?? '').trim(),
    description: String(b.description ?? cons.description ?? '').trim(),
    weight: String(b.weight ?? cons.weight ?? '').trim(),
    pieces: String(b.pieces ?? '').trim(),
    charges: String(b.charges ?? '').trim(),
    total: String(b.total ?? '').trim(),
    currency: String(b.currency ?? 'USD').trim() || 'USD',
    date: String(b.date ?? new Date().toISOString().slice(0, 10)).trim(),
    note: String(b.note ?? '').trim(),
  };
  const updated = await store.updateConsignmentReceipt(cons.id, receipt);
  return res.json({ receipt: { ...receipt, tracking_number: updated.tracking_number }, consignment: updated });
}));

app.get('/api/admin/customers', authRequired, adminRequired, wrap(async (req, res) => {
  const users = await store.listUsers();
  return res.json({ customers: users.map(publicUser) });
}));

/* Admin Support Inbox portal */
app.get('/api/admin/support', authRequired, adminRequired, wrap(async (req, res) => {
  return res.json({ messages: await store.listSupportMessages() });
}));
app.post('/api/admin/support/:id/reply', authRequired, adminRequired, wrap(async (req, res) => {
  const reply = String(req.body.reply || '').trim();
  if (!reply) return res.status(400).json({ error: 'Reply cannot be empty.' });
  const updated = await store.updateSupportMessage(req.params.id, {
    admin_reply: reply, status: 'replied', replied_at: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: 'Support message not found.' });
  return res.json({ message: updated });
}));
app.post('/api/admin/support/:id/close', authRequired, adminRequired, wrap(async (req, res) => {
  const updated = await store.updateSupportMessage(req.params.id, { status: 'closed' });
  if (!updated) return res.status(404).json({ error: 'Support message not found.' });
  return res.json({ message: updated });
}));

/* Admin Customer Chat portal */
app.get('/api/admin/chat', authRequired, adminRequired, wrap(async (req, res) => {
  const all = await store.listAllChatMessages();
  const threads = {};
  for (const m of all) {
    if (!threads[m.customer_email]) threads[m.customer_email] = { customer_email: m.customer_email, customer_name: m.customer_name || '', messages: [] };
    threads[m.customer_email].messages.push(m);
    if (m.customer_name) threads[m.customer_email].customer_name = m.customer_name;
  }
  return res.json({ threads: Object.values(threads) });
}));
app.get('/api/admin/chat/:email', authRequired, adminRequired, wrap(async (req, res) => {
  const messages = await store.listChatMessagesByEmail(normEmail(req.params.email));
  return res.json({ messages });
}));
app.post('/api/admin/chat/:email/reply', authRequired, adminRequired, wrap(async (req, res) => {
  const message = String(req.body.message || req.body.reply || '').trim();
  if (!message) return res.status(400).json({ error: 'Message cannot be empty.' });
  const customerEmail = normEmail(req.params.email);
  const customer = await store.getUserByEmail(customerEmail);
  const saved = await store.createChatMessage({
    customer_email: customerEmail,
    customer_name: customer ? customer.name : '',
    sender_role: 'admin', message,
  });
  return res.status(201).json({ message: saved });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, storage: store ? store.mode : 'starting', email_live: OTP_LIVE() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong on the server.' }); });

async function start() {
  store = createStore();
  await store.init();
  console.log(`[fastxgloebe] Storage ready: ${store.mode}`);
  console.log(`[fastxgloebe] Email mode: ${OTP_LIVE() ? 'LIVE (Brevo) — codes go to real inboxes' : 'DEV — codes are logged/returned by the API only. Set OTP_MODE=live for production.'}`);
  app.listen(PORT, () => console.log(`[fastxgloebe] Listening on port ${PORT}`));
}
if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
module.exports = { app, start };
