# Gym Log

Offline-first gym logger (Vietnamese UI). Runs as a PWA (GitHub Pages) and as an Android app that reads Health Connect.

- Set table with "last time" column, auto rest timer (vibrate + beep), screen wake lock
- PR detection (e1RM / heaviest / reps), double-progression suggestions
- Weekly hard sets per muscle, 16-week heatmap, per-exercise e1RM chart, body weight
- Android app: sleep (with stages), resting HR, HRV, steps, calories, weight and watch workouts from Health Connect
  (e.g. Xiaomi Watch → Mi Fitness → Health Connect); readiness card; watch HR/kcal matched to logged workouts
- Nutrition: kcal/protein quick log, targets from BMR or watch energy expenditure + goal, weight trend
- Export: per-set CSV, per-day CSV (sleep, HR, steps, kcal, intake, weight), full JSON backup; imports old `FitnessCoach_v4_backup_*.json`
- Optional AI coach (bring your own key: Anthropic or any OpenAI-compatible endpoint); you approve every change
- All data stays on the device

| | |
|---|---|
| Web | https://cuongphamisb.github.io/gym-log/ |
| Android APK | https://github.com/cuongphamISB/gym-log/releases/latest/download/GymLog.apk |

Dev: `python -m http.server 8765` · tests `npm test` · Android `npm run sync` then build in Android Studio, or push to `main` and let `.github/workflows/android.yml` build a signed APK release.
Catalog from the old HTML: `node tools/extract_catalog.js <old.html>`. Icons: `python tools/make_icons.py`, `python tools/make_android_icons.py`.
