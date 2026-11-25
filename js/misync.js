// Pull a window of Mi Fitness cloud data for L.ingestMiCloud. Runs in Node (tests) and in the Android app,
// where HTTP goes through Capacitor's native client (no CORS) and the session lives in IndexedDB.
(function (root) {
  'use strict';
  const M = root.MiCloud || (typeof require === 'function' ? require('./micloud.js') : null);

  async function fetchWindow(client, { days = 30, hrDays = 10, watermark = 0 } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 86400, hrFrom = now - hrDays * 86400;
    const errors = {};
    const safe = async (k, p) => { try { return await p; } catch (e) { errors[k] = e.message; return []; } };
    // daily reports are capped at 100 rows per call: walk back in 90-day slices
    const dailyAll = async key => { const out = []; for (let end = now + 86400; end > from; end -= 90 * 86400) out.push(...await client.daily(key, Math.max(from, end - 90 * 86400), end)); return out; };
    const sleepDaily = await safe('sleep', dailyAll('sleep'));
    const hrDaily = await safe('heart_rate', dailyAll('heart_rate'));
    const stepsDaily = await safe('steps', dailyAll('steps'));
    const spo2Daily = await safe('spo2', dailyAll('spo2'));
    const sleepRaw = await safe('sleep(raw)', client.raw('sleep', from - 86400, now));
    const restRaw = await safe('resting_heart_rate', client.raw('resting_heart_rate', from, now));
    const hrRaw = await safe('heart_rate(raw)', client.raw('heart_rate', hrFrom, now));
    const spo2Raw = await safe('spo2(raw)', client.raw('spo2', hrFrom, now));
    let sports = [], wm = watermark;
    try { const s = await client.sports(watermark); sports = s.records; wm = s.watermark; } catch (e) { errors.sports = e.message; }
    return { data: { sleepDaily, sleepRaw, hrDaily, hrRaw, restRaw, stepsDaily, spo2Daily, spo2Raw, sports }, watermark: wm, errors };
  }

  // Native HTTP adapter for the Android app (CapacitorHttp). Collects Set-Cookie from the response headers.
  function capacitorHttp() {
    const CH = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.CapacitorHttp;
    if (!CH) return null;
    return async ({ method, url, headers, noRedirect, timeout }) => {
      const r = await CH.request({ url, method, headers: Object.assign({ 'User-Agent': 'Android-3.52.0' }, headers || {}), responseType: 'text', disableRedirects: !!noRedirect, connectTimeout: 20000, readTimeout: timeout || 30000 });
      const h = {}; for (const [k, v] of Object.entries(r.headers || {})) h[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
      const cookies = {};
      const raw = h['set-cookie'] || '';
      for (const part of raw.split(/,(?=\s*[A-Za-z0-9_.\-]+=)/)) { const kv = part.split(';')[0]; const i = kv.indexOf('='); if (i > 0) cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
      return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data), headers: h, cookies };
    };
  }

  const api = { fetchWindow, capacitorHttp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MiSync = api;
})(typeof self !== 'undefined' ? self : globalThis);
