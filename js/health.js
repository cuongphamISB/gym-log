// Health Connect bridge. Only active inside the Android app (Capacitor); the web version shows how to get it.
(function () {
  'use strict';
  const cap = () => window.Capacitor;
  const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
  const plugin = () => (cap() && cap().Plugins && cap().Plugins.Health) || null;
  const READ = ['sleep', 'heartRate', 'restingHeartRate', 'heartRateVariability', 'steps', 'calories', 'totalCalories', 'weight', 'workouts'];

  async function available() {
    if (!isNative()) return { available: false, reason: 'web' };
    if (!plugin()) return { available: false, reason: 'plugin missing' };
    try { return await plugin().isAvailable(); } catch (e) { return { available: false, reason: e.message }; }
  }
  async function connect() { return plugin().requestAuthorization({ read: READ, requestHistoryAccess: true }); }
  async function status() { return plugin().checkAuthorization({ read: READ }); }
  async function openSettings() { return plugin().openHealthConnectSettings(); }

  // Reads the last `days` days. Each data type fails independently (a denied permission only loses that type).
  async function fetchAll(days = 30) {
    const H = plugin();
    const end = new Date();
    const start = new Date(end.getTime() - days * 864e5);
    // day buckets from local midnight so totals line up with calendar days
    const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
    const iso = d => d.toISOString();
    const errors = {};
    const safe = (k, p, pick) => p.then(pick).catch(e => { errors[k] = (e && e.message) || String(e); return []; });
    const samples = (dataType, limit) => H.readSamples({ dataType, startDate: iso(start), endDate: iso(end), limit, ascending: true });
    const daily = dataType => H.queryAggregated({ dataType, startDate: iso(startDay), endDate: iso(end), bucket: 'day', aggregation: 'sum' });
    const [sleep, restHr, hrv, weight, steps, activeKcal, totalKcal, workouts] = await Promise.all([
      safe('sleep', samples('sleep', 500), r => r.samples),
      safe('restingHeartRate', samples('restingHeartRate', 1000), r => r.samples),
      safe('heartRateVariability', samples('heartRateVariability', 2000), r => r.samples),
      safe('weight', samples('weight', 500), r => r.samples),
      safe('steps', daily('steps'), r => r.samples),
      safe('calories', daily('calories'), r => r.samples),
      safe('totalCalories', daily('totalCalories'), r => r.samples),
      safe('workouts', H.queryWorkouts({ startDate: iso(start), endDate: iso(end), limit: 200, ascending: true }), r => r.workouts),
    ]);
    // heart rate during each watch workout (avg / max)
    for (const w of workouts) {
      try {
        const r = await H.readSamples({ dataType: 'heartRate', startDate: w.startDate, endDate: w.endDate, limit: 5000, ascending: true });
        const v = r.samples.map(s => s.value).filter(Number.isFinite);
        if (v.length) { w.avgHr = Math.round(v.reduce((a, b) => a + b, 0) / v.length); w.maxHr = Math.round(Math.max(...v)); }
      } catch (e) { errors.heartRate = (e && e.message) || String(e); }
    }
    return { raw: { sleep, restHr, hrv, weight, steps, activeKcal, totalKcal, workouts }, errors };
  }

  window.HealthSync = { isNative, available, connect, status, openSettings, fetchAll, READ };
})();
