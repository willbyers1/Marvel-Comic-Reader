const fs = require('fs');
const path = require('path');

console.log('🚀 Preparing Capacitor static web assets in /out...');

// Ensure /out directory exists
if (!fs.existsSync('out')) {
  fs.mkdirSync('out', { recursive: true });
}
if (!fs.existsSync('out/_next')) {
  fs.mkdirSync('out/_next', { recursive: true });
}

// 1. Copy compiled HTML or write fallback
const compiledHtmlPath = path.join('.next', 'server', 'app', 'index.html');
if (fs.existsSync(compiledHtmlPath)) {
  fs.copyFileSync(compiledHtmlPath, path.join('out', 'index.html'));
  console.log('✅ Transferred compiled index.html to out/index.html');
} else {
  if (!fs.existsSync(path.join('out', 'index.html'))) {
    fs.writeFileSync(
      path.join('out', 'index.html'),
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Marvel Comics</title></head><body><div id="app"></div></body></html>'
    );
  }
  console.log('✅ Ensured out/index.html exists');
}

// 2. Copy static JS/CSS bundles
const nextStaticPath = path.join('.next', 'static');
if (fs.existsSync(nextStaticPath)) {
  fs.cpSync(nextStaticPath, path.join('out', '_next', 'static'), { recursive: true });
  console.log('✅ Transferred static bundles to out/_next/static');
}

// 3. Copy public assets
if (fs.existsSync('public')) {
  fs.cpSync('public', 'out', { recursive: true });
  console.log('✅ Transferred public assets to out/');
}

console.log('🎉 Capacitor static assets ready in /out!');
