#!/usr/bin/env node
/**
 * Tager screenshots af en lokal URL i en række mobil/tablet-størrelser.
 *
 * Forudsætning: en lokal server kører allerede (fx `python3 -m http.server 8743`
 * fra projektets rod).
 *
 * Brug:
 *   node tools/screenshot.js [url] [outDir]
 *
 * Eksempel:
 *   python3 -m http.server 8743 &
 *   node tools/screenshot.js http://localhost:8743/ screenshots
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const URL_ARG = process.argv[2] || 'http://localhost:8743/';
const OUT_DIR = process.argv[3] || 'screenshots';

// Bredde × højde, matcher trin 2 i MOBIL-AUDIT.md
const SIZES = [
  { name: '360x640',  width: 360,  height: 640 },
  { name: '390x844',  width: 390,  height: 844 },
  { name: '414x896',  width: 414,  height: 896 },
  { name: '768x1024', width: 768,  height: 1024 },
];

async function shoot(browser, url, outDir, size, landscape) {
  const w = landscape ? size.height : size.width;
  const h = landscape ? size.width : size.height;
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: size.width < 768,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500); // lad kortet/markører nå at tegne færdigt

  const suffix = landscape ? `${size.name}-landscape` : `${size.name}-portrait`;
  const file = path.join(outDir, `${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('Gemt:', file);

  await context.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const size of SIZES) {
      await shoot(browser, URL_ARG, OUT_DIR, size, false);
      await shoot(browser, URL_ARG, OUT_DIR, size, true);
    }
  } finally {
    await browser.close();
  }
})();
