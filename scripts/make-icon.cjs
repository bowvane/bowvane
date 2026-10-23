// Génère build/icon.png (1024 px) depuis docs/logo.svg : à lancer avec « xvfb-run npx electron scripts/make-icon.cjs ».
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const svg = readFileSync(join(__dirname, "..", "docs", "logo.svg"), "utf8");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,<body style="margin:0;background:transparent">${encodeURIComponent(svg)}</body>`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  writeFileSync(join(__dirname, "..", "build", "icon.png"), img.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});
