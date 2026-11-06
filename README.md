# Gym Log

Offline-first PWA for logging gym workouts on a phone (Vietnamese UI).

- Strong/Hevy-style set table with "last time" column, auto rest timer (vibrate + beep), screen wake lock
- PR detection (e1RM / heaviest / reps), double-progression suggestions
- Weekly hard sets per muscle, 16-week heatmap, per-exercise e1RM chart, body weight
- Editable exercises and templates; exercise guides from the original v4 catalog
- Export: CSV (one row per set) and full JSON backup; imports old `FitnessCoach_v4_backup_*.json`
- Optional AI coach (bring your own key: Anthropic or any OpenAI-compatible endpoint); you approve every change
- Data lives in IndexedDB on the device; nothing is sent anywhere unless you press an AI coach button

Run locally: `python -m http.server 8765` then open http://localhost:8765.
Tests: `node --test test/logic.test.js`.
Rebuild the catalog from the old HTML: `node tools/extract_catalog.js <old.html>`.
