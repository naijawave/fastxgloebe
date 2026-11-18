'use strict';
/**
 * Storage layer for fastxgloebe.
 *
 * Two modes, same async interface:
 *  - Postgres mode: when DATABASE_URL is set (Render + Supabase in production).
 *    Tables are auto-created on boot. Data persists across deploys/restarts.
 *  - JSON file mode: when DATABASE_URL is absent (local development / tests).
 *    Data is kept in <project>/data/db.json. No external service needed.
 *    The data/ folder is git-ignored.
 *
 * Collections: users, consignments, trackingEvents, supportMessages,
 *              chatMessages, authCodes (email verification / password reset).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const COLLECTIONS = ['users', 'consignments', 'trackingEvents', 'supportMessages', 'chatMessages', 'authCodes'];

/* ---------------- JSON file store ---------------- */
class JsonStore {
  constructor(file) {
    this.file = file;
    this.mode = 'json-file';
    this.db = {};
    for (const k of COLLECTIONS) this.db[k] = [];
  }
  async init() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* start clean on corrupt file */ }
    }
    for (const k of COLLECTIONS) if (!Array.isArray(this.db[k])) this.db[k] = [];
    this._save();
  }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2)); }

  /* users */
  async countUsers() { return this.db.users.length; }
  async createUser(u) {
    const user = { id: uid(), phone: '', address: '', verified: true, created_at: nowIso(), ...u };
    this.db.users.push(user); this._save(); return user;
  }
  async getUserByEmail(email) { return this.db.users.find(x => x.email === email) || null; }
  async getUserById(id) { return this.db.users.find(x => x.id === String(id)) || null; }
  async listUsers() { return [...this.db.users].sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  async updateUser(id, patch) {
    const u = await this.getUserById(id); if (!u) return null;
    Object.assign(u, patch); this._save(); return u;
  }

  /* auth codes (email verification / password reset) */
  async saveAuthCode(rec) {
    // one active code per email+purpose: replace any previous one
    this.db.authCodes = this.db.authCodes.filter(c => !(c.email === rec.email && c.purpose === rec.purpose));
    const row = { id: uid(), created_at: nowIso(), ...rec };
    this.db.authCodes.push(row); this._save(); return row;
  }
  async getAuthCode(email, purpose) {
    return this.db.authCodes.find(c => c.email === email && c.purpose === purpose) || null;
  }
  async deleteAuthCode(id) {
    this.db.authCodes = this.db.authCodes.filter(c => c.id !== String(id)); this._save();
  }

  /* consignments + tracking events */
  async createConsignment(c, event) {
    const cons = { id: uid(), lat: null, lng: null, receipt: null, created_at: nowIso(), updated_at: nowIso(), ...c };
    this.db.consignments.push(cons);
    this.db.trackingEvents.push({ id: uid(), consignment_id: cons.id, lat: cons.lat, lng: cons.lng, created_at: nowIso(), ...event });
    this._save(); return cons;
  }
  async getConsignmentByTracking(tracking) {
    return this.db.consignments.find(x => x.tracking_number === tracking) || null;
  }
  async getConsignmentById(id) { return this.db.consignments.find(x => x.id === String(id)) || null; }
  async listConsignments() { return [...this.db.consignments].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async listConsignmentsByCustomerEmail(email) {
    return this.db.consignments.filter(x => x.customer_email === email)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async updateConsignmentLocation(id, { status, current_location, note, lat, lng }, event) {
    const cons = await this.getConsignmentById(id);
    if (!cons) return null;
    cons.status = status; cons.current_location = current_location;
    if (note !== undefined) cons.note = note;
    if (lat !== undefined) cons.lat = lat;
    if (lng !== undefined) cons.lng = lng;
    cons.updated_at = nowIso();
    this.db.trackingEvents.push({ id: uid(), consignment_id: cons.id, lat: cons.lat, lng: cons.lng, created_at: nowIso(), ...event });
    this._save(); return cons;
  }
  async updateConsignmentReceipt(id, receipt) {
    const cons = await this.getConsignmentById(id);
    if (!cons) return null;
    cons.receipt = receipt; cons.updated_at = nowIso(); this._save(); return cons;
  }
  async listTrackingEvents(consignmentId) {
    return this.db.trackingEvents.filter(x => x.consignment_id === String(consignmentId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /* support messages (Contact Support -> Admin Support Inbox portal) */
  async createSupportMessage(m) {
    const msg = { id: uid(), status: 'open', admin_reply: null, replied_at: null, created_at: nowIso(), ...m };
    this.db.supportMessages.push(msg); this._save(); return msg;
  }
  async listSupportMessages() { return [...this.db.supportMessages].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async listSupportMessagesByEmail(email) {
    return this.db.supportMessages.filter(x => x.email === email)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async getSupportMessage(id) { return this.db.supportMessages.find(x => x.id === String(id)) || null; }
  async updateSupportMessage(id, patch) {
    const msg = await this.getSupportMessage(id);
    if (!msg) return null;
    Object.assign(msg, patch); this._save(); return msg;
  }

  /* customer <-> admin chat (Admin Customer Chat portal) */
  async createChatMessage(m) {
    const msg = { id: uid(), created_at: nowIso(), ...m };
    this.db.chatMessages.push(msg); this._save(); return msg;
  }
  async listChatMessagesByEmail(email) {
    return this.db.chatMessages.filter(x => x.customer_email === email)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async listAllChatMessages() {
    return [...this.db.chatMessages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

/* ---------------- Postgres store ---------------- */
class PgStore {
  constructor(connectionString) {
    const { Pool } = require('pg');
    this.mode = 'postgres';
    // Supabase / Render Postgres require SSL in production; allow self-signed.
    this.pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  async init() {
    // Retry for up to ~3 minutes: right after a Supabase password reset the
    // pooler can briefly reject the new password (28P01) while it propagates,
    // and a single failed attempt should not kill the deploy.
    const attempts = 18;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this._initOnce();
        if (i > 1) console.log(`[fastxgloebe] Postgres connected on attempt ${i}.`);
        return;
      } catch (e) {
        console.error(`[fastxgloebe] Postgres connect attempt ${i}/${attempts} failed: ${e.code || ''} ${e.message || e}`);
        if (i === attempts) throw e;
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }
  async _initOnce() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;
      CREATE TABLE IF NOT EXISTS consignments (
        id TEXT PRIMARY KEY,
        tracking_number TEXT UNIQUE NOT NULL,
        customer_email TEXT NOT NULL,
        customer_name TEXT DEFAULT '',
        sender_name TEXT DEFAULT '',
        origin TEXT DEFAULT '',
        destination TEXT DEFAULT '',
        description TEXT DEFAULT '',
        weight TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Received',
        current_location TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE consignments ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE consignments ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
      ALTER TABLE consignments ADD COLUMN IF NOT EXISTS receipt JSONB;
      CREATE TABLE IF NOT EXISTS tracking_events (
        id TEXT PRIMARY KEY,
        consignment_id TEXT NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        location TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        email TEXT NOT NULL,
        subject TEXT DEFAULT '',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        admin_reply TEXT,
        replied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        customer_email TEXT NOT NULL,
        customer_name TEXT DEFAULT '',
        sender_role TEXT NOT NULL DEFAULT 'customer',
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS auth_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code TEXT NOT NULL,
        payload JSONB,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (email, purpose)
      );
    `);
  }
  async countUsers() { const r = await this.pool.query('SELECT COUNT(*)::int AS n FROM users'); return r.rows[0].n; }
  async createUser(u) {
    const id = uid();
    const r = await this.pool.query(
      'INSERT INTO users (id,name,email,password_hash,role,phone,address,verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [id, u.name, u.email, u.password_hash, u.role, u.phone || '', u.address || '', u.verified !== false]);
    return r.rows[0];
  }
  async getUserByEmail(email) { const r = await this.pool.query('SELECT * FROM users WHERE email=$1', [email]); return r.rows[0] || null; }
  async getUserById(id) { const r = await this.pool.query('SELECT * FROM users WHERE id=$1', [String(id)]); return r.rows[0] || null; }
  async listUsers() { const r = await this.pool.query('SELECT * FROM users ORDER BY created_at ASC'); return r.rows; }
  async updateUser(id, patch) {
    const cur = await this.getUserById(id); if (!cur) return null;
    const next = { ...cur, ...patch };
    const r = await this.pool.query(
      'UPDATE users SET name=$1, phone=$2, address=$3, password_hash=$4, verified=$5 WHERE id=$6 RETURNING *',
      [next.name, next.phone || '', next.address || '', next.password_hash, next.verified !== false, String(id)]);
    return r.rows[0];
  }

  async saveAuthCode(rec) {
    const r = await this.pool.query(
      `INSERT INTO auth_codes (id,email,purpose,code,payload,expires_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email,purpose) DO UPDATE SET code=EXCLUDED.code, payload=EXCLUDED.payload, expires_at=EXCLUDED.expires_at, created_at=now()
       RETURNING *`,
      [uid(), rec.email, rec.purpose, rec.code, rec.payload ? JSON.stringify(rec.payload) : null, rec.expires_at]);
    return r.rows[0];
  }
  async getAuthCode(email, purpose) {
    const r = await this.pool.query('SELECT * FROM auth_codes WHERE email=$1 AND purpose=$2', [email, purpose]);
    return r.rows[0] || null;
  }
  async deleteAuthCode(id) { await this.pool.query('DELETE FROM auth_codes WHERE id=$1', [String(id)]); }

  async createConsignment(c, event) {
    const id = uid();
    const r = await this.pool.query(
      `INSERT INTO consignments (id,tracking_number,customer_email,customer_name,sender_name,origin,destination,description,weight,status,current_location,note,lat,lng,receipt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, c.tracking_number, c.customer_email, c.customer_name, c.sender_name, c.origin, c.destination, c.description, c.weight, c.status, c.current_location, c.note,
       c.lat ?? null, c.lng ?? null, c.receipt ? JSON.stringify(c.receipt) : null]);
    await this.pool.query(
      'INSERT INTO tracking_events (id,consignment_id,status,location,note,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid(), id, event.status, event.location, event.note, event.lat ?? c.lat ?? null, event.lng ?? c.lng ?? null]);
    return r.rows[0];
  }
  async getConsignmentByTracking(tracking) {
    const r = await this.pool.query('SELECT * FROM consignments WHERE tracking_number=$1', [tracking]); return r.rows[0] || null;
  }
  async getConsignmentById(id) { const r = await this.pool.query('SELECT * FROM consignments WHERE id=$1', [String(id)]); return r.rows[0] || null; }
  async listConsignments() { const r = await this.pool.query('SELECT * FROM consignments ORDER BY created_at DESC'); return r.rows; }
  async listConsignmentsByCustomerEmail(email) {
    const r = await this.pool.query('SELECT * FROM consignments WHERE customer_email=$1 ORDER BY created_at DESC', [email]); return r.rows;
  }
  async updateConsignmentLocation(id, { status, current_location, note, lat, lng }, event) {
    const cur = await this.getConsignmentById(id); if (!cur) return null;
    const nextLat = lat === undefined ? cur.lat : lat;
    const nextLng = lng === undefined ? cur.lng : lng;
    const r = await this.pool.query(
      'UPDATE consignments SET status=$1, current_location=$2, note=COALESCE($3,note), lat=$4, lng=$5, updated_at=now() WHERE id=$6 RETURNING *',
      [status, current_location, note === undefined ? null : note, nextLat, nextLng, String(id)]);
    if (!r.rows[0]) return null;
    await this.pool.query(
      'INSERT INTO tracking_events (id,consignment_id,status,location,note,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid(), String(id), event.status, event.location, event.note, event.lat ?? nextLat, event.lng ?? nextLng]);
    return r.rows[0];
  }
  async updateConsignmentReceipt(id, receipt) {
    const r = await this.pool.query(
      'UPDATE consignments SET receipt=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [JSON.stringify(receipt), String(id)]);
    return r.rows[0] || null;
  }
  async listTrackingEvents(consignmentId) {
    const r = await this.pool.query('SELECT * FROM tracking_events WHERE consignment_id=$1 ORDER BY created_at ASC', [String(consignmentId)]);
    return r.rows;
  }

  async createSupportMessage(m) {
    const r = await this.pool.query(
      'INSERT INTO support_messages (id,name,email,subject,message) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [uid(), m.name, m.email, m.subject, m.message]);
    return r.rows[0];
  }
  async listSupportMessages() { const r = await this.pool.query('SELECT * FROM support_messages ORDER BY created_at DESC'); return r.rows; }
  async listSupportMessagesByEmail(email) {
    const r = await this.pool.query('SELECT * FROM support_messages WHERE email=$1 ORDER BY created_at DESC', [email]); return r.rows;
  }
  async getSupportMessage(id) { const r = await this.pool.query('SELECT * FROM support_messages WHERE id=$1', [String(id)]); return r.rows[0] || null; }
  async updateSupportMessage(id, patch) {
    const cur = await this.getSupportMessage(id); if (!cur) return null;
    const next = { ...cur, ...patch };
    const r = await this.pool.query(
      'UPDATE support_messages SET status=$1, admin_reply=$2, replied_at=$3 WHERE id=$4 RETURNING *',
      [next.status, next.admin_reply, next.replied_at, String(id)]);
    return r.rows[0];
  }

  async createChatMessage(m) {
    const r = await this.pool.query(
      'INSERT INTO chat_messages (id,customer_email,customer_name,sender_role,message) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [uid(), m.customer_email, m.customer_name || '', m.sender_role, m.message]);
    return r.rows[0];
  }
  async listChatMessagesByEmail(email) {
    const r = await this.pool.query('SELECT * FROM chat_messages WHERE customer_email=$1 ORDER BY created_at ASC', [email]); return r.rows;
  }
  async listAllChatMessages() {
    const r = await this.pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC'); return r.rows;
  }
}

function createStore() {
  if (process.env.DATABASE_URL) {
    // Pasting a long connection string on a phone can smuggle in line breaks
    // or spaces (e.g. a break inside the hostname -> DNS ENOTFOUND). The URL
    // never legitimately contains whitespace, so strip it all.
    const raw = process.env.DATABASE_URL;
    const clean = raw.replace(/\s+/g, '');
    if (clean !== raw) console.log('[fastxgloebe] DATABASE_URL contained whitespace/breaks — cleaned automatically.');
    console.log('[fastxgloebe] Storage: Postgres (DATABASE_URL set) — data persists.');
    return new PgStore(clean);
  }
  const file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
  console.log(`[fastxgloebe] Storage: JSON file dev mode (${file}) — no DATABASE_URL set. Set DATABASE_URL in production so data persists on Render.`);
  return new JsonStore(file);
}

module.exports = { createStore, JsonStore, PgStore };
