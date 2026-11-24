// Xiaomi Mi Fitness cloud client (the data the watch syncs through Mi Fitness): QR login, passToken renewal,
// signed + RC4-encrypted requests to {region}.hlth.io.mi.com. Protocol follows the open-source
// Jenwein/mifit and LilZeeCN/mi-health-exporter clients. The HTTP layer is injected:
//   http({ method, url, headers }) -> { status, text, headers, cookies }   (cookies = Set-Cookie name->value)
// so the same code runs in Node (tests / one-off login) and in the Android app (native HTTP, no CORS).
(function (root) {
  'use strict';
  const ACCOUNT = 'https://account.xiaomi.com';
  const SID = 'miothealth';
  const BASE_HOST = 'https://hlth.io.mi.com';
  const BASE_PATH = '/app/v1/';
  const SAFE_PREFIX = '&&&START&&&';

  // ---------- bytes / crypto ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const subtle = () => (root.crypto && root.crypto.subtle) || (typeof require === 'function' && require('crypto').webcrypto.subtle);
  const rand = n => { const b = new Uint8Array(n); (root.crypto || require('crypto').webcrypto).getRandomValues(b); return b; };
  function b64e(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function b64d(str) { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const sha1 = async bytes => new Uint8Array(await subtle().digest('SHA-1', bytes));
  const sha256 = async bytes => new Uint8Array(await subtle().digest('SHA-256', bytes));

  // RC4 with the first 1024 keystream bytes dropped; one instance = one continuous stream
  function rc4(key) {
    const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
    let i0 = 0, j0 = 0;
    const crypt = data => {
      const out = new Uint8Array(data.length);
      for (let k = 0; k < data.length; k++) {
        i0 = (i0 + 1) & 255; j0 = (j0 + S[i0]) & 255; [S[i0], S[j0]] = [S[j0], S[i0]];
        out[k] = data[k] ^ S[(S[i0] + S[j0]) & 255];
      }
      return out;
    };
    crypt(new Uint8Array(1024));
    return crypt;
  }
  function genNonce() {
    const b = new Uint8Array(12); b.set(rand(8));
    const minutes = Math.floor(Date.now() / 60000);
    new DataView(b.buffer).setInt32(8, minutes, false);
    return b64e(b);
  }
  async function signedNonce(ssecurity, nonce) { return b64e(await sha256(concat(b64d(ssecurity), b64d(nonce)))); }
  async function signature(method, path, params, sn) {
    const parts = [method.toUpperCase(), path, ...Object.keys(params).sort().map(k => `${k}=${params[k]}`), sn];
    return b64e(await sha1(enc.encode(parts.join('&'))));
  }
  async function encryptParams(method, path, plain, ssecurity, nonce) {
    const sn = await signedNonce(ssecurity, nonce);
    const p = {}; for (const [k, v] of Object.entries(plain)) if (k && v) p[k] = v;
    p.rc4_hash__ = await signature(method, path, p, sn);
    const c = rc4(b64d(sn));
    const out = {};
    for (const k of Object.keys(p).sort()) out[k] = b64e(c(enc.encode(p[k])));
    out.signature = await signature(method, path, out, sn);
    out._nonce = nonce;
    return out;
  }
  async function decryptBody(body, ssecurity, nonce) {
    const sn = await signedNonce(ssecurity, nonce);
    return JSON.parse(dec.decode(rc4(b64d(sn))(b64d(body.trim()))));
  }
  const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const cookieHeader = o => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
  function parseJson(text, what) {
    let t = (text || '').trim();
    if (t.startsWith(SAFE_PREFIX)) t = t.slice(SAFE_PREFIX.length);
    try { return JSON.parse(t); } catch (e) { throw new Error(`${what}: phản hồi không phải JSON`); }
  }
  const regionHost = region => region === 'cn' ? BASE_HOST : BASE_HOST.replace('://', `://${region}.`);
  const COUNTRY = { VN: 'sg', SG: 'sg', TH: 'sg', MY: 'sg', ID: 'sg', PH: 'sg', IN: 'i2', RU: 'ru', US: 'us', DE: 'de', FR: 'de', GB: 'de', ES: 'de', IT: 'de' };

  // ---------- account: QR login, STS, renewal ----------
  const newDeviceId = () => Array.from(rand(8), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  async function requestQr(http, deviceId) {
    const r = await http({ method: 'GET', url: `${ACCOUNT}/longPolling/loginUrl?${qs({ sid: SID, _json: 'true' })}`, headers: { Cookie: cookieHeader({ deviceId }) } });
    const j = parseJson(r.text, 'QR login');
    if (j.code && j.code !== 0) throw new Error(`QR login: code ${j.code} ${j.desc || ''}`);
    if (!j.lp || !j.qr) throw new Error('QR login: thiếu lp/qr');
    return { loginUrl: j.loginUrl, qr: j.qr, lp: j.lp };
  }
  // Big integers (nonce, ids) must be read as exact text: JSON.parse would round them and break the signature.
  function rawField(text, name) {
    const m = new RegExp('"' + name + '"\\s*:\\s*(-?\\d+)').exec(text || '');
    return m ? m[1] : null;
  }
  function parseLogin(r, what, known = {}) {
    const j = parseJson(r.text, what);
    for (const k of ['nonce', 'userId', 'cUserId']) { const raw = rawField(r.text, k); if (raw !== null) j[k] = raw; }
    if (j.code && j.code !== 0) throw Object.assign(new Error(`${what}: code ${j.code} ${j.desc || ''}`), { code: j.code });
    if (j.securityStatus && +j.securityStatus !== 0) throw Object.assign(new Error(`${what}: Xiaomi yêu cầu xác minh bảo mật`), { notificationUrl: j.notificationUrl });
    const c = r.cookies || {};
    let pragma = {};
    try { pragma = JSON.parse((r.headers && (r.headers['extension-pragma'] || r.headers['Extension-Pragma'])) || '{}'); } catch (e) { /* ignore */ }
    const pick = k => (j[k] !== undefined && j[k] !== null && String(j[k])) || c[k] || known[k] || '';
    const res = {
      userId: pick('userId'), passToken: pick('passToken'), cUserId: pick('cUserId'),
      ssecurity: j.ssecurity || pragma.ssecurity || '', nonce: String(j.nonce ?? pragma.nonce ?? ''), location: j.location || '',
      regionHint: j.userRegion || j.region || j.countryCode || j.country || null,
    };
    const missing = ['userId', 'passToken', 'cUserId', 'ssecurity', 'nonce', 'location'].filter(k => !res[k]);
    if (missing.length) throw new Error(`${what}: thiếu ${missing.join(', ')}`);
    return res;
  }
  async function pollQr(http, challenge, deviceId) {
    const r = await http({ method: 'GET', url: challenge.lp, headers: { Cookie: cookieHeader({ deviceId }) }, timeout: 300000 });
    return parseLogin(r, 'QR login');
  }
  async function exchangeSts(http, login, deviceId, region) {
    if (!/^https:\/\//.test(login.location)) throw new Error('STS URL không phải https');
    const clientSign = b64e(await sha1(enc.encode(`nonce=${login.nonce}&${login.ssecurity}`)));
    const url = `${login.location}${login.location.includes('?') ? '&' : '?'}${qs({ clientSign, _userIdNeedEncrypt: 'true' })}`;
    // follow redirects by hand so cookies set on any hop are kept
    const c = {}; let next = url, status = 0; const trail = [];
    for (let hop = 0; hop < 6 && next; hop++) {
      const r = await http({ method: 'GET', url: next, headers: {}, noRedirect: true });
      status = r.status; Object.assign(c, r.cookies || {});
      trail.push(`${r.status} ${new URL(next).host} [${Object.keys(r.cookies || {}).join(',')}]`);
      const loc = r.headers && (r.headers.location || r.headers.Location);
      if (c[`${SID}_serviceToken`] || c.serviceToken || !(r.status >= 300 && r.status < 400) || !loc) break;
      next = new URL(loc, next).href;
    }
    const serviceToken = c[`${SID}_serviceToken`] || c.serviceToken;
    if (!serviceToken) throw Object.assign(new Error('STS: không nhận được serviceToken (' + trail.join(' -> ') + ')'), { trail });
    const rg = region || (login.regionHint && (COUNTRY[String(login.regionHint).toUpperCase()] || String(login.regionHint).toLowerCase())) || 'sg';
    return { userId: login.userId, cUserId: login.cUserId, passToken: login.passToken, ssecurity: login.ssecurity, serviceToken, deviceId, region: rg, createdAt: new Date().toISOString(), tokenAt: new Date().toISOString(), locale: c.locale || c.uLocale || '' };
  }
  async function renew(http, s) {
    const r = await http({ method: 'GET', url: `${ACCOUNT}/pass/serviceLogin?${qs({ sid: SID, _json: 'true' })}`, headers: { Cookie: cookieHeader({ userId: s.userId, passToken: s.passToken, deviceId: s.deviceId }) }, noRedirect: true });
    const login = parseLogin(r, 'Gia hạn phiên', { userId: s.userId, passToken: s.passToken, cUserId: s.cUserId });
    const n = await exchangeSts(http, login, s.deviceId, s.region);
    return Object.assign({}, s, n, { createdAt: s.createdAt, renewedAt: new Date().toISOString() });
  }

  // ---------- health API ----------
  class Client {
    constructor(http, session, onSession) { this.http = http; this.s = session; this.onSession = onSession || (() => {}); }
    async call(endpoint, data, retried) {
      const path = BASE_PATH + endpoint;
      const nonce = genNonce();
      const params = await encryptParams('GET', path, data ? { data: JSON.stringify(data) } : {}, this.s.ssecurity, nonce);
      const s = this.s;
      const r = await this.http({ method: 'GET', url: `${regionHost(s.region)}${path}?${qs(params)}`, headers: { Cookie: cookieHeader({ serviceToken: s.serviceToken, cUserId: s.cUserId, userId: s.userId, locale: s.locale }), region_tag: s.region } });
      if (r.status === 401 && !retried && s.passToken) {
        this.s = await renew(this.http, s); await this.onSession(this.s);
        return this.call(endpoint, data, true);
      }
      if (r.status < 200 || r.status >= 300) throw Object.assign(new Error(`Mi cloud ${endpoint}: HTTP ${r.status}`), { status: r.status });
      const j = await decryptBody(r.text, s.ssecurity, nonce);
      if (j.code !== 0) throw Object.assign(new Error(`Mi cloud ${endpoint}: code ${j.code} ${j.message || ''}`), { code: j.code });
      return j.result || {};
    }
    // raw records by time window, all pages
    async raw(key, start, end) {
      const out = []; let next = '';
      for (let page = 0; page < 60; page++) {
        const res = await this.call('data/get_fitness_data_by_time', Object.assign({ start_time: start, end_time: end, key }, next ? { next_key: next } : {}));
        out.push(...(res.data_list || []));
        if (!res.has_more || !res.next_key) break;
        next = res.next_key;
      }
      return out;
    }
    // per-day aggregated reports (sleep, steps, calories, heart_rate, spo2, stress)
    async daily(key, start, end) {
      const res = await this.call('data/get_aggregated_fitness_data_by_time', { tag: 'daily_report', key, start_time: start, end_time: end, reverse: true, limit: 100 });
      return res.data_list || [];
    }
    async sports(watermark = 0) {
      const out = []; let wm = watermark;
      for (let page = 0; page < 40; page++) {
        const res = await this.call('data/get_sport_records_by_watermark', { watermark: wm, limit: 50, phone_id: '', with_cheat_info: true });
        out.push(...(res.sport_records || []));
        if (res.watermark) wm = res.watermark;
        if (!res.has_more || !(res.sport_records || []).length) break;
      }
      return { records: out, watermark: wm };
    }
  }

  const api = { requestQr, pollQr, exchangeSts, renew, newDeviceId, Client, _t: { rc4, encryptParams, decryptBody, signedNonce, signature, genNonce, b64e, b64d } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MiCloud = api;
})(typeof self !== 'undefined' ? self : globalThis);
