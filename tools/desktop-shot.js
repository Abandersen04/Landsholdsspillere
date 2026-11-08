#!/usr/bin/env node
// Desktop-reference-screenshot (1440x900), bruges til før/efter-sammenligning
// når der laves mobil-rettelser, for at verificere at desktop er uændret.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8743';
const OUT_DIR = process.argv[3] || 'screenshots';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '07-desktop-home_1440x900.png') });

  const missingBtn = page.locator('#show-missing-btn');
  await missingBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT_DIR, '08-desktop-missing-modal_1440x900.png') });
  await page.locator('#missing-close').click().catch(() => {});
  await page.waitForTimeout(200);

  const marker = page.locator('.leaflet-marker-icon, .leaflet-interactive').first();
  if (await marker.count()) {
    await marker.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, '09-desktop-marker-popup_1440x900.png') });
  }

  await browser.close();
  console.log('Desktop-screenshots gemt i', OUT_DIR);
})();
