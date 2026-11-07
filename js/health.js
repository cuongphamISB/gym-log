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
    const hourly = (dataType, aggregation, days) => {
      const s = new Date(end.getTime() - days * 864e5); s.setMinutes(0, 0, 0);
      return H.queryAggregated({ dataType, startDate: iso(s), endDate: iso(end), bucket: 'hour', aggregation });
    };
    const [sleep, restHr, hrv, weight, steps, activeKcal, totalKcal, workouts, hrHourly, stepsHourly] = await Promise.all([
      safe('sleep', samples('sleep', 1000), r => r.samples),
      safe('restingHeartRate', samples('restingHeartRate', 1000), r => r.samples),
      safe('heartRateVariability', samples('heartRateVariability', 3000), r => r.samples),
      safe('weight', samples('weight', 500), r => r.samples),
      safe('steps', daily('steps'), r => r.samples),
      safe('calories', daily('calories'), r => r.samples),
      // the plugin cannot aggregate total calories: read the records and sum per day in ingestHealth
      safe('totalCalories', samples('totalCalories', 20000), r => r.samples),
      safe('workouts', H.queryWorkouts({ startDate: iso(start), endDate: iso(end), limit: 200, ascending: true }), r => r.workouts),
      safe('heartRate', hourly('heartRate', ['min', 'max', 'average'], Math.min(days, 35)), r => r.samples),
      safe('steps(hour)', hourly('steps', 'sum', Math.min(days, 14)), r => r.samples),
    ]);
    // heart rate during each watch workout: avg / max and a 30-second series for the zone chart
    for (const w of workouts) {
      try {
        const r = await H.readSamples({ dataType: 'heartRate', startDate: w.startDate, endDate: w.endDate, limit: 10000, ascending: true });
        const pts = r.samples.filter(s => Number.isFinite(s.value));
        if (!pts.length) continue;
        const v = pts.map(s => s.value);
        w.avgHr = Math.round(v.reduce((a, b) => a + b, 0) / v.length); w.maxHr = Math.round(Math.max(...v));
        const t0 = new Date(w.startDate).getTime(), buckets = {};
        for (const s of pts) { const k = Math.floor((new Date(s.startDate).getTime() - t0) / 30000); (buckets[k] = buckets[k] || []).push(s.value); }
        w.hrSeries = Object.keys(buckets).map(Number).sort((a, b) => a - b).map(k => [k * 30, Math.round(buckets[k].reduce((a, b) => a + b, 0) / buckets[k].length)]);
      } catch (e) { errors.heartRate = (e && e.message) || String(e); }
    }
    return { raw: { sleep, restHr, hrv, weight, steps, activeKcal, totalKcal, workouts, hrHourly, stepsHourly }, errors };
  }

  window.HealthSync = { isNative, available, connect, status, openSettings, fetchAll, READ };
})();
