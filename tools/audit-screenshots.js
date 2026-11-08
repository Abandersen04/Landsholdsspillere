#!/usr/bin/env node
/**
 * Kører en fast liste af sider/tilstande igennem på de fire mobilstørrelser
 * fra MOBIL-AUDIT.md trin 2, og gemmer screenshots til ./screenshots/.
 *
 * Kræver en lokal server, fx:
 *   python3 -m http.server 8743
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8743';
const OUT_DIR = process.argv[3] || 'screenshots';

const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '414x896', width: 414, height: 896 },
  { name: '768x1024', width: 768, height: 1024 },
];

async function newPage(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 768,
    hasTouch: true,
  });
  const page = await context.newPage();
  return { context, page };
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('Gemt:', file);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const size of SIZES) {
    // ---- Forside: default (sidebar/bottomsheet lukket/peek) ----
    for (const landscape of [false, true]) {
      const w = landscape ? size.height : size.width;
      const h = landscape ? size.width : size.height;
      const { context, page } = await newPage(browser, w, h);
      const tag = `${size.name}-${landscape ? 'landscape' : 'portrait'}`;
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(800);
      await shot(page, OUT_DIR, `01-home-default_${tag}`);

      // ---- Filterpanel åbent ----
      const mobileToggle = page.locator('#sidebar-toggle-mobile');
      const desktopToggle = page.locator('#sidebar-toggle');
      if (await mobileToggle.isVisible().catch(() => false)) {
        await mobileToggle.click();
      } else if (await desktopToggle.isVisible().catch(() => false)) {
        await desktopToggle.click();
      }
      await page.waitForTimeout(400);
      await shot(page, OUT_DIR, `02-sidebar-open_${tag}`);

      // ---- Missing-data modal ----
      const missingBtn = page.locator('#show-missing-btn');
      if (await missingBtn.isVisible().catch(() => false)) {
        await missingBtn.click();
        await page.waitForTimeout(400);
        await shot(page, OUT_DIR, `03-missing-modal_${tag}`);
        await page.locator('#missing-close').click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // ---- Om-modal ----
      const omBtn = page.locator('#om-btn');
      if (await omBtn.isVisible().catch(() => false)) {
        await omBtn.click();
        await page.waitForTimeout(300);
        await shot(page, OUT_DIR, `04-om-modal_${tag}`);
        await page.locator('#om-close').click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // Luk sidebar/sheet igen før marker-klik
      await page.locator('#sidebar-close').click({ timeout: 1000 }).catch(() => {});
      await page.mouse.click(w / 2, Math.min(h - 40, h * 0.6)).catch(() => {});
      await page.waitForTimeout(300);

      // ---- Marker-popup ----
      const marker = page.locator('.leaflet-marker-icon, .leaflet-interactive').first();
      if (await marker.count()) {
        await marker.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
        await shot(page, OUT_DIR, `05-marker-popup_${tag}`);
      }

      await context.close();
    }
  }

  // ---- Undersider (kun 390x844 portræt + landscape) ----
  const subpages = [
    ['landsholdskurven', 'landsholdskurven'],
    ['quiz', 'quiz'],
    ['rekordlister', 'rekordlister'],
  ];
  for (const [slug, label] of subpages) {
    for (const landscape of [false, true]) {
      const size = SIZES[1]; // 390x844
      const w = landscape ? size.height : size.width;
      const h = landscape ? size.width : size.height;
      const { context, page } = await newPage(browser, w, h);
      await page.goto(`${BASE}/${slug}/`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(600);
      await shot(page, OUT_DIR, `06-${label}_390x844-${landscape ? 'landscape' : 'portrait'}`);
      await context.close();
    }
  }

  await browser.close();
})();
