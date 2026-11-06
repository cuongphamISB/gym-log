// Copy the web app into www/ for the Android build (no service worker: the app ships its files).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
for (const item of ['index.html', 'manifest.webmanifest', 'privacypolicy.html', 'css', 'js', 'img', 'icons']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log('www/ ready');
