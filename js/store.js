// IndexedDB persistence: one record per key. Keeps a daily snapshot for recovery.
(function () {
  'use strict';
  const DB_NAME = 'gymlog', STORE = 'kv';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const get = key => tx('readonly', st => st.get(key));
  const put = (key, val) => tx('readwrite', st => { st.put(val, key); });

  let pending = null, timer = null, saving = Promise.resolve();
  function saveSoon(state) {
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }
  function flush() {
    clearTimeout(timer);
    if (!pending) return saving;
    const snap = JSON.parse(JSON.stringify(pending)); // structured copy at this instant
    pending = null;
    saving = saving.then(() => put('db', snap)).catch(e => { console.error(e); window.dispatchEvent(new CustomEvent('store-error', { detail: e })); });
    return saving;
  }
  async function load() { return (await get('db')) || null; }
  async function snapshotDaily(state, today) {
    const meta = (await get('snapMeta')) || {};
    if (meta.date === today) return;
    await put('snap', state);
    await put('snapMeta', { date: today });
  }
  async function loadSnapshot() { return { db: await get('snap'), meta: await get('snapMeta') }; }
  async function persist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) { return null; }
  }
  async function estimate() { try { return await navigator.storage.estimate(); } catch (e) { return null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.Store = { load, saveSoon, flush, snapshotDaily, loadSnapshot, persist, estimate, get, put };
})();
