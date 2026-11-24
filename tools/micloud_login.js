// One-time Xiaomi QR login on the PC, then a quick data probe.
// usage: node tools/micloud_login.js <qr-png-path> <session-json-path>
// The session (incl. passToken) is written only to <session-json-path>; keep it out of git.
'use strict';
const fs = require('fs');
const M = require('../js/micloud.js');
const [, , qrPath, sessionPath] = process.argv;

async function http({ method, url, headers, noRedirect, timeout }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout || 30000);
  try {
    const r = await fetch(url, { method, headers: Object.assign({ 'User-Agent': 'Android-3.52.0' }, headers || {}), redirect: noRedirect ? 'manual' : 'follow', signal: ctl.signal });
    const cookies = {};
    for (const sc of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
    const h = {}; r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    return { status: r.status, text: await r.text(), headers: h, cookies };
  } finally { clearTimeout(t); }
}

(async () => {
  const deviceId = M.newDeviceId();
  const ch = await M.requestQr(http, deviceId);
  const img = await fetch(ch.qr);
  fs.writeFileSync(qrPath, Buffer.from(await img.arrayBuffer()));
  console.log('QR_READY', qrPath);
  let login = null;
  for (let i = 0; i < 6 && !login; i++) {
    try { login = await M.pollQr(http, ch, deviceId); }
    catch (e) { if (/abort/i.test(e.name + e.message)) continue; throw e; }
  }
  if (!login) throw new Error('QR hết hạn, chưa được quét');
  const s = await M.exchangeSts(http, login, deviceId, null);
  fs.writeFileSync(sessionPath, JSON.stringify(s, null, 1));
  console.log('LOGIN_OK region=' + s.region + ' hint=' + login.regionHint);
  const c = new M.Client(http, s, ns => fs.writeFileSync(sessionPath, JSON.stringify(ns, null, 1)));
  const now = Math.floor(Date.now() / 1000), d14 = now - 14 * 86400;
  for (const key of ['heart_rate', 'sleep', 'stress', 'spo2', 'steps', 'calories']) {
    try {
      const rows = await c.daily(key, d14, now + 86400);
      const v = rows[0] ? JSON.parse(rows[0].value || '{}') : null;
      console.log(`daily ${key}: ${rows.length} days; newest ${rows[0] && new Date(rows[0].time * 1000).toISOString().slice(0, 10)} fields=${v ? Object.keys(v).join(',').slice(0, 200) : '-'}`);
    } catch (e) { console.log(`daily ${key}: ERROR ${e.message}`); }
  }
  for (const key of ['heart_rate', 'resting_heart_rate', 'hrv', 'stress', 'sleep']) {
    try {
      const rows = await c.raw(key, now - 2 * 86400, now);
      console.log(`raw ${key}: ${rows.length} rows; sample ${rows[0] ? String(rows[0].value).slice(0, 160) : '-'}`);
    } catch (e) { console.log(`raw ${key}: ERROR ${e.message}`); }
  }
})().catch(e => { console.error('FAIL', e.message, e.notificationUrl || ''); process.exit(1); });
