'use strict';
/* End-to-end HTTP test for fastxgloebe. Starts its own server on port 3210
   with a throwaway JSON data file (no DATABASE_URL) and OTP in DEV mode
   (codes come back in the API response as dev_code, like local testing). */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://127.0.0.1:3210';
const tmpData = path.join(os.tmpdir(), 'fxg-e2e-' + Date.now() + '.json');
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; failures.push(name + ' ' + extra); console.log('  FAIL', name, extra); }
}
async function req(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {}; try { data = await res.json(); } catch { /* */ }
  return { status: res.status, data };
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function registerVerified(name, email, password, phone) {
  const reg = await req('POST', '/api/auth/register', { name, email, password, phone });
  if (reg.status !== 201 || !reg.data.dev_code) return { reg, ver: null };
  const ver = await req('POST', '/api/auth/verify', { email, code: reg.data.dev_code });
  return { reg, ver };
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: '3210', DATA_FILE: tmpData, DATABASE_URL: '', JWT_SECRET: 'e2e-test-secret', OTP_MODE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', d => process.stderr.write('[server] ' + d));
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const r = await fetch(BASE + '/api/health'); up = r.ok; } catch { await wait(250); }
    }
    check('server starts and /api/health responds', up);

    /* ---- Homepage content (Changes 1-5) ---- */
    const homeRes = await fetch(BASE + '/');
    const home = await homeRes.text();
    check('homepage serves HTML with fastxgloebe name', homeRes.ok && home.includes('fastxgloebe'));
    check('stats band: 12,000+ Projects Completed present', home.includes('data-target="12000"') && home.includes('Projects Completed'));
    check('stats band: 4,500+ Clients (calculated — NOT both 5,000) + Employees present',
      home.includes('data-target="4500"') && home.includes('Clients') && home.includes('data-target="500"') && home.includes('Employees') && !home.includes('data-target="5000"'));
    check('stats band: 12+ Years of Experience (not 35)', home.includes('data-target="12"') && home.includes('Years of Experience') && !home.includes('data-target="35"'));
    check('NVOCC write-up present with fastxgloebe name', home.includes('NVOCC') && home.includes('cargo consolidation') && home.includes('Read More'));
    check('globe slider lines present', home.includes('Global Choice For Your Global Needs') && home.includes('We Link The Globe') && home.includes('fastxgloebe Delivers'));
    check('auto sliders present (2 sliders, dots/arrows markup)', (home.match(/data-slider/g) || []).length >= 2 && home.includes('sDots'));
    check('testimonials section present with 6 testimonials (>3)', home.includes('What People Say') && (home.match(/class="testi"/g) || []).length === 6,
      'count=' + (home.match(/class="testi"/g) || []).length);
    check('testimonials use NEW names (not Abella/Joel/Misha)', !home.includes('Abella') && !home.includes('Joel Dawson') && !home.includes('Misha'));
    check('testimonial dates spread over past years', home.includes('2019') && home.includes('2021') && home.includes('2024'));
    check('professional team section present with 4 members', home.includes('Our Professional Team') && (home.match(/class="teamCard"/g) || []).length === 4);
    check('team roles include Assistant Manager + Packaging and Unitization Manager',
      home.includes('Assistant Manager') && home.includes('Packaging and Unitization Manager'));
    check('about section with company GOALS present', home.includes('About Us') && home.includes('Our Goals') && home.includes('Our Mission'));
    check('footer: Quick Links + Get in Touch + info@fastxgloebe.com', home.includes('Quick Links') && home.includes('Get in Touch') && home.includes('info@fastxgloebe.com'));
    check('footer: Dubai address (not the reference address) + changed phone',
      home.includes('Dubai') && home.includes('Business Bay') && !home.includes('Fahidi Heights') && home.includes('+971 4 524 8091') && !home.includes('600 50050'));

    /* ---- Change 9: address, names, stats, routes, worldwide copy ---- */
    check('office address: Empire Heights Tower A, Office 1804 (footer + drawer)',
      home.includes('Office 1804, Empire Heights Tower A') && home.includes('Empire Heights Tower A,<br>Business Bay'));
    check('NO "Al Saqr" and no old Al Manara address anywhere on homepage',
      !/saqr/i.test(home) && !home.includes('Al Manara'));
    check('team: Michael Carter is Operations Manager; Daniel Osei removed',
      home.includes('Michael Carter') && home.includes('Operations Manager') && !home.includes('Daniel Osei'));
    check('testimonials: Carlos Mendes + Priya Sharma in; David Okafor + Amina Bello out',
      home.includes('Carlos Mendes') && home.includes('Priya Sharma') && !home.includes('David Okafor') && !home.includes('Amina Bello'));
    check('no Nigerian/West-African names left in team or testimonials',
      !home.includes('Osei') && !home.includes('Okafor') && !home.includes('Bello') && !home.includes('Nwosu') && !home.includes('Okonkwo'));
    check('routes section present: Where We Ship + See more toggle + hidden extra routes',
      home.includes('Where We Ship') && home.includes('id="routesMore"') && home.includes('id="routesToggle"') && home.includes('See more'));
    check('routes are non-African global cities (London/New York/Singapore/Mumbai + Rotterdam/Sydney/Toronto/Hamburg)',
      home.includes('London') && home.includes('New York') && home.includes('Singapore') && home.includes('Mumbai') &&
      home.includes('Rotterdam') && home.includes('Sydney') && home.includes('Toronto') && home.includes('Hamburg'));
    check('NO African destinations anywhere on homepage (no Lagos/Nigeria/Tema/Mombasa/Durban/Ghana/Kenya)',
      !home.includes('Lagos') && !home.includes('Nigeria') && !home.includes('Tema') && !home.includes('Mombasa') &&
      !home.includes('Durban') && !home.includes('Ghana') && !home.includes('Kenya') && !home.includes('Africa'));
    check('worldwide copy: site states delivery to all countries worldwide',
      home.includes('all countries worldwide'));
    check('footer year is 2026', home.includes('2026 fastxgloebe'));
    check('tracking map containers present (Leaflet)', home.includes('trackMap') && home.includes('leaflet'));
    check('receipt view present', home.includes('receiptView') && home.includes('receiptCard'));
    check('chat + support portals present in markup', home.includes('Customer Chat Portal') && home.includes('Support Inbox Portal'));
    check('NO "built by AI" text anywhere on homepage', !/built by ai/i.test(home));
    const appJs = await (await fetch(BASE + '/app.js')).text();
    check('app.js has count-up + slider autoplay + map pin logic, no AI branding',
      appJs.includes('animateCount') && appJs.includes('IntersectionObserver') && appJs.includes('L.map') && !/built by ai/i.test(appJs));

    /* ---- Change 8: hamburger drawer, CSS redo, live pictures, features ---- */
    check('hamburger menu: button + slide-out drawer + overlay present',
      home.includes('id="menuBtn"') && home.includes('id="navDrawer"') && home.includes('id="drawerOverlay"') && home.includes('aria-controls="navDrawer"'));
    check('header no longer shows the open two-row nav (links moved into drawer)',
      !home.includes('<nav id="nav">') && home.includes('class="drawerNav"'));
    check('drawer contains all main links (Services/About/Tracking/Support/My Account)',
      home.includes('href="#services"') && home.includes('href="#about"') && home.includes('href="#track"') && home.includes('href="#support"') && home.includes('id="navAccount"') && home.includes('id="navAdmin"'));
    check('hero rotating photo slideshow present (4 slides)',
      (home.match(/heroSlide/g) || []).length >= 4 && home.includes('heroDots'));
    check('service cards now carry photos (4 photo cards)',
      (home.match(/svcCard/g) || []).length === 4);
    check('photo gallery strip present', home.includes('galleryTrack') && home.includes('From Port to Doorstep'));
    check('lively features present: quick chips, how-tracking steps, back-to-top, live clock',
      home.includes('class="chip') && home.includes('How tracking works') && home.includes('id="toTop"') && home.includes('dubaiClock'));
    const css = await (await fetch(BASE + '/styles.css')).text();
    check('CSS redone: new pine/lime palette + drawer + ken burns, old amber gone',
      css.includes('#0b3d2c') && css.includes('.drawer') && css.includes('kenburns') && !css.includes('#f2b33d') && !/built by ai/i.test(css));
    check('app.js has drawer + hero slideshow + clock + scroll-reveal logic',
      appJs.includes('setDrawer') && appJs.includes('heroGo') && appJs.includes('tickClock') && appJs.includes('revealed'));
    check('app.js has routes See more/See less toggle logic (Change 9)',
      appJs.includes('routesToggle') && appJs.includes('See less') && appJs.includes('routesMore'));

    /* ---- Change 10: dedicated Track + Messages views, richer menu ---- */
    check('Change 10: dedicated Track + Messages views present',
      home.includes('id="trackView"') && home.includes('id="messagesView"') && home.includes('id="trackBack"') && home.includes('id="messagesBack"'));
    check('Change 10: menu has Track Consignment + Messages entries and a topbar Track button',
      home.includes('data-open="track"') && home.includes('data-open="messages"') && home.includes('id="topTrackBtn"') && home.includes('Track Consignment'));
    check('Change 10: chat + support replies live in the Messages view (not buried in Account)',
      home.includes('id="messagesBody"') && home.includes('id="chatThread"') && home.includes('id="mySupport"') && home.includes('id="accountMessagesBtn"'));
    check('Change 10: app.js has view switching logic',
      appJs.includes('openView') && appJs.includes('showMainView') && appJs.includes('refreshMessagesVisibility'));

    /* ---- Auth: email-code registration (Change 7) ---- */
    const reg1 = await req('POST', '/api/auth/register', { name: 'Owner One', email: 'owner@example.com', password: 'secret1' });
    check('register user1 returns pending + dev_code (201)', reg1.status === 201 && reg1.data.pending === true && /^\d{6}$/.test(reg1.data.dev_code || ''), JSON.stringify(reg1.data));
    check('pending user1 cannot log in before verification (401)',
      (await req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'secret1' })).status === 401);
    const wrongCode = await req('POST', '/api/auth/verify', { email: 'owner@example.com', code: '000000' === reg1.data.dev_code ? '111111' : '000000' });
    check('wrong verification code rejected (400)', wrongCode.status === 400);
    const ver1 = await req('POST', '/api/auth/verify', { email: 'owner@example.com', code: reg1.data.dev_code });
    check('verify user1 succeeds with token (201)', ver1.status === 201 && !!ver1.data.token, JSON.stringify(ver1.data));
    check('user1 (first VERIFIED account) becomes admin', ver1.data.user && ver1.data.user.role === 'admin');
    const adminToken = ver1.data.token;

    const { reg: reg2, ver: ver2 } = await registerVerified('Customer Two', 'customer@example.com', 'secret2');
    check('register+verify user2 succeeds', reg2.status === 201 && ver2 && ver2.status === 201);
    check('user2 is customer (not admin)', ver2.data.user && ver2.data.user.role === 'customer');
    const custToken = ver2.data.token;

    const dup = await req('POST', '/api/auth/register', { name: 'Dup', email: 'customer@example.com', password: 'secret9' });
    check('duplicate email rejected (409)', dup.status === 409);
    const badLogin = await req('POST', '/api/auth/login', { email: 'customer@example.com', password: 'wrong-pass' });
    check('wrong password rejected (401)', badLogin.status === 401);
    const login2 = await req('POST', '/api/auth/login', { email: 'customer@example.com', password: 'secret2' });
    check('user2 login works after verification', login2.status === 200 && !!login2.data.token);
    const me = await req('GET', '/api/auth/me', null, custToken);
    check('GET /api/auth/me returns user2', me.status === 200 && me.data.user.email === 'customer@example.com');

    /* ---- Profile ---- */
    const prof = await req('PATCH', '/api/profile', { phone: '+234 800 000 0000', address: '12 Marina Road, Lagos' }, custToken);
    check('profile update works (phone+address saved)', prof.status === 200 && prof.data.user.phone.includes('800') && prof.data.user.address.includes('Marina'));
    const me2 = await req('GET', '/api/auth/me', null, custToken);
    check('profile persists on /me', me2.data.user.address === '12 Marina Road, Lagos');
    const pwWrong = await req('POST', '/api/profile/change-password', { currentPassword: 'nope', newPassword: 'secret2b' }, custToken);
    check('change-password with wrong current password rejected (401)', pwWrong.status === 401);
    const pwOk = await req('POST', '/api/profile/change-password', { currentPassword: 'secret2', newPassword: 'secret2b' }, custToken);
    check('change-password works', pwOk.status === 200 && pwOk.data.ok === true);
    check('login with changed password works', (await req('POST', '/api/auth/login', { email: 'customer@example.com', password: 'secret2b' })).status === 200);

    /* ---- Admin stats ---- */
    const stats = await req('GET', '/api/admin/stats', null, adminToken);
    check('admin stats works (2 users)', stats.status === 200 && stats.data.stats.users === 2);

    /* ---- Booking -> auto tracking code + receipt (Changes 6+7) ---- */
    const created = await req('POST', '/api/admin/consignments', {
      customerEmail: 'customer@example.com', customerName: 'Customer Two', senderName: 'Sender A',
      origin: 'Dubai, UAE', destination: 'Lagos, Nigeria', description: 'Household goods',
      weight: '120 kg', status: 'Received', currentLocation: 'Dubai Warehouse', note: 'Booked in',
    }, adminToken);
    check('admin books a package (201)', created.status === 201, JSON.stringify(created.data));
    const cons = created.data.consignment || {};
    check('tracking code auto-generated in FXG- format', /^FXG-\d+$/.test(cons.tracking_number || ''), cons.tracking_number);
    check('consignment starts at Dubai Warehouse', cons.current_location === 'Dubai Warehouse');

    const rec1 = await req('GET', '/api/admin/consignments/' + cons.id + '/receipt', null, adminToken);
    check('receipt exists automatically with the booking', rec1.status === 200 && !!rec1.data.receipt);
    check('receipt carries the same auto tracking code', rec1.data.receipt && rec1.data.receipt.tracking_number === cons.tracking_number);
    check('receipt pre-filled from booking (receiver/origin/description)',
      rec1.data.receipt.receiver_name === 'Customer Two' && rec1.data.receipt.origin === 'Dubai, UAE' && rec1.data.receipt.description === 'Household goods');
    const recFill = await req('PUT', '/api/admin/consignments/' + cons.id + '/receipt',
      { pieces: '14', charges: 'Freight 450, Handling 50', total: '500', currency: 'USD' }, adminToken);
    check('admin fills receipt (pieces/charges/total saved)', recFill.status === 200 && recFill.data.receipt.total === '500' && recFill.data.receipt.pieces === '14');
    const rec2 = await req('GET', '/api/admin/consignments/' + cons.id + '/receipt', null, adminToken);
    check('filled receipt persists with charges', rec2.data.receipt.charges.includes('450') && rec2.data.receipt.total === '500');
    const recForbidden = await req('GET', '/api/admin/consignments/' + cons.id + '/receipt', null, custToken);
    check('customer cannot open admin receipt (403)', recForbidden.status === 403);

    /* ---- Public tracking + map pin (Change 6) ---- */
    const track1 = await req('GET', '/api/track/' + (cons.tracking_number || '').toLowerCase());
    check('public track (lowercase) finds consignment', track1.status === 200 && track1.data.consignment.tracking_number === cons.tracking_number);
    check('public track shows initial location + 1 timeline event, no pin yet',
      track1.data.consignment.current_location === 'Dubai Warehouse' && track1.data.consignment.events.length === 1 && (track1.data.consignment.lat === null || track1.data.consignment.lat === undefined));
    check('unknown tracking number returns 404', (await req('GET', '/api/track/FXG-00000000')).status === 404);

    const upd = await req('POST', '/api/admin/consignments/' + cons.id + '/location',
      { status: 'In Transit', location: 'Apapa Port, Lagos', note: 'Arrived in Lagos', lat: 6.465422, lng: 3.406448 }, adminToken);
    check('admin updates location WITH map pin (lat/lng saved)',
      upd.status === 200 && upd.data.consignment.current_location === 'Apapa Port, Lagos' &&
      Math.abs(upd.data.consignment.lat - 6.465422) < 1e-9 && Math.abs(upd.data.consignment.lng - 3.406448) < 1e-9,
      JSON.stringify(upd.data.consignment || {}));
    const track2 = await req('GET', '/api/track/' + cons.tracking_number);
    check('public track shows new location + the admin-placed pin',
      track2.status === 200 && track2.data.consignment.current_location === 'Apapa Port, Lagos' &&
      Math.abs(track2.data.consignment.lat - 6.465422) < 1e-9 && Math.abs(track2.data.consignment.lng - 3.406448) < 1e-9);
    check('timeline has 2 events, latest carries the pin too',
      track2.data.consignment.events.length === 2 && track2.data.consignment.events[1].status === 'In Transit' &&
      Math.abs((track2.data.consignment.events[1].lat || 0) - 6.465422) < 1e-9);

    const mine = await req('GET', '/api/my/consignments', null, custToken);
    check('user2 lists own consignment', mine.status === 200 && mine.data.consignments.length === 1 &&
      mine.data.consignments[0].tracking_number === cons.tracking_number);
    const adminMine = await req('GET', '/api/my/consignments', null, adminToken);
    check('admin (not the customer) sees 0 in own list', adminMine.status === 200 && adminMine.data.consignments.length === 0);

    /* ---- Customer Chat portal (Change 5) ---- */
    const chat1 = await req('POST', '/api/my/chat', { message: 'Hello, please confirm my delivery date.' }, custToken);
    check('customer sends chat message (201)', chat1.status === 201 && chat1.data.message.sender_role === 'customer');
    const threads = await req('GET', '/api/admin/chat', null, adminToken);
    check('admin chat portal lists the customer thread', threads.status === 200 && threads.data.threads.length === 1 &&
      threads.data.threads[0].customer_email === 'customer@example.com' && threads.data.threads[0].messages.length === 1);
    const chatReply = await req('POST', '/api/admin/chat/customer@example.com/reply', { message: 'Confirmed — delivery is this Friday.' }, adminToken);
    check('admin replies in chat portal (201)', chatReply.status === 201 && chatReply.data.message.sender_role === 'admin');
    const myChat = await req('GET', '/api/my/chat', null, custToken);
    check('customer sees admin chat reply in own thread', myChat.status === 200 && myChat.data.messages.length === 2 &&
      myChat.data.messages[1].message.includes('Friday'));
    const chatForbidden = await req('GET', '/api/admin/chat', null, custToken);
    check('customer cannot open admin chat portal (403)', chatForbidden.status === 403);

    /* ---- Support Inbox portal (existing flow, Change 5) ---- */
    const sup = await req('POST', '/api/support', { subject: 'Where is my box?', message: 'Please check my shipment.' }, custToken);
    check('user2 sends support message (201)', sup.status === 201, JSON.stringify(sup.data));
    const supId = sup.data.message && sup.data.message.id;
    check('guest support message works (201)',
      (await req('POST', '/api/support', { name: 'Guest', email: 'guest@example.com', subject: 'Guest q', message: 'Hello support' })).status === 201);
    const adminSup = await req('GET', '/api/admin/support', null, adminToken);
    check('support messages drop into admin Support Inbox (2)', adminSup.status === 200 && adminSup.data.messages.length === 2);
    const reply = await req('POST', '/api/admin/support/' + supId + '/reply', { reply: 'It is now at Apapa Port, Lagos.' }, adminToken);
    check('admin replies from Support Inbox', reply.status === 200 && reply.data.message.status === 'replied');
    const mySup = await req('GET', '/api/my/support', null, custToken);
    check('user2 sees support reply', mySup.status === 200 && mySup.data.messages.length === 1 &&
      mySup.data.messages[0].admin_reply === 'It is now at Apapa Port, Lagos.');
    check('admin closes support ticket', (await req('POST', '/api/admin/support/' + supId + '/close', {}, adminToken)).data.message.status === 'closed');

    /* ---- Customers + guards ---- */
    const customers = await req('GET', '/api/admin/customers', null, adminToken);
    check('admin lists customers/users (2, no password hashes)',
      customers.status === 200 && customers.data.customers.length === 2 && !JSON.stringify(customers.data).includes('password'));
    check('customer token calling admin create gets 403', (await req('POST', '/api/admin/consignments', { customerEmail: 'x@example.com' }, custToken)).status === 403);
    check('customer token calling admin location update gets 403',
      (await req('POST', '/api/admin/consignments/' + cons.id + '/location', { status: 'Delivered', location: 'Fake', lat: 0, lng: 0 }, custToken)).status === 403);
    check('customer token calling admin stats gets 403', (await req('GET', '/api/admin/stats', null, custToken)).status === 403);
    check('no token calling admin stats gets 401', (await req('GET', '/api/admin/stats')).status === 401);
    const trackAfter = await req('GET', '/api/track/' + cons.tracking_number);
    check('blocked update changed neither location nor pin',
      trackAfter.data.consignment.current_location === 'Apapa Port, Lagos' && Math.abs(trackAfter.data.consignment.lat - 6.465422) < 1e-9);

    /* ---- Forgot password by email code (Change 7) ---- */
    const forgot = await req('POST', '/api/auth/forgot', { email: 'customer@example.com' });
    check('forgot-password returns a dev_code in dev mode', forgot.status === 200 && /^\d{6}$/.test(forgot.data.dev_code || ''), JSON.stringify(forgot.data));
    const resetWrong = await req('POST', '/api/auth/reset', { email: 'customer@example.com', code: '000000' === forgot.data.dev_code ? '111111' : '000000', newPassword: 'resetpass1' });
    check('wrong reset code rejected (400)', resetWrong.status === 400);
    const resetOk = await req('POST', '/api/auth/reset', { email: 'customer@example.com', code: forgot.data.dev_code, newPassword: 'resetpass1' });
    check('reset with correct code works', resetOk.status === 200 && resetOk.data.ok === true);
    check('old password no longer logs in (401)', (await req('POST', '/api/auth/login', { email: 'customer@example.com', password: 'secret2b' })).status === 401);
    check('new password logs in', (await req('POST', '/api/auth/login', { email: 'customer@example.com', password: 'resetpass1' })).status === 200);

    /* ---- Resend code flow ---- */
    const reg3 = await req('POST', '/api/auth/register', { name: 'Third User', email: 'third@example.com', password: 'secret3' });
    const resend = await req('POST', '/api/auth/resend-code', { email: 'third@example.com' });
    check('resend-code issues a fresh code', resend.status === 200 && /^\d{6}$/.test(resend.data.dev_code || ''));
    const ver3 = await req('POST', '/api/auth/verify', { email: 'third@example.com', code: resend.data.dev_code });
    check('verify with resent code works, role customer', ver3.status === 201 && ver3.data.user.role === 'customer');
    void reg3;
  } finally {
    server.kill();
    try { fs.unlinkSync(tmpData); } catch { /* */ }
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
