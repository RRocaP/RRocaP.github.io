#!/usr/bin/env node
/**
 * Headless build-time fallback PNG renderer for HeroDiffusion.
 *
 * Boots Astro dev (so Vite can serve `src/lib/diffusion-field.ts` as ESM),
 * then injects a tiny driver page via setContent that imports the sim and
 * seeks to phase-3 mid-breath. Screenshots the canvas, derives WebP + AVIF.
 *
 * Output:
 *   public/hero-diffusion-fallback.png
 *   public/hero-diffusion-fallback.webp
 *   public/hero-diffusion-fallback.avif
 *
 * Run manually:  npm run diffusion:fallback
 *
 * Not wired into `npm run build` — only re-run when DiffusionField params change.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(REPO_ROOT, "public");
const PORT = 4399;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT_PNG = resolve(PUBLIC_DIR, "hero-diffusion-fallback.png");
const OUT_WEBP = resolve(PUBLIC_DIR, "hero-diffusion-fallback.webp");
const OUT_AVIF = resolve(PUBLIC_DIR, "hero-diffusion-fallback.avif");

const DRIVER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>diffusion fallback driver</title>
    <style>
      html, body { margin: 0; padding: 0; background: #f5efe6; }
      body { display: flex; align-items: stretch; justify-content: stretch; }
      #stage { width: 1200px; height: 1140px; position: relative; background: #f5efe6; }
      #stage::before {
        content: ""; position: absolute; inset: 0;
        background: radial-gradient(ellipse 70% 55% at 50% 60%, rgba(200,74,58,0.06) 0%, transparent 75%);
        z-index: 0; pointer-events: none;
      }
      canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; display: block; }
    </style>
  </head>
  <body>
    <div id="stage"><canvas id="c"></canvas></div>
    <script type="module">
      import { DiffusionField, DEFAULTS } from "${ORIGIN}/src/lib/diffusion-field.ts";
      const canvas = document.getElementById("c");
      const field = new DiffusionField(canvas);
      // Snapshot mid State A→B (cluster forming) — most "structure emerging" beat.
      const phaseDuration = DEFAULTS.transitionDuration + DEFAULTS.maxStagger + DEFAULTS.holdDuration;
      field.renderStill(phaseDuration * 0.5);
      window.__DIFFUSION_READY__ = true;
    </script>
  </body>
</html>`;

function waitForReady(url, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolveP, rejectP) => {
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) return resolveP();
          if (Date.now() - start > timeoutMs) return rejectP(new Error("Astro dev never responded"));
          setTimeout(tick, 400);
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) return rejectP(new Error("Astro dev never responded"));
          setTimeout(tick, 400);
        });
    };
    tick();
  });
}

async function main() {
  if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });

  console.log(`[fallback] Starting Astro dev on :${PORT}…`);
  const astro = spawn("npx", ["astro", "dev", "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  });
  astro.stdout.on("data", () => {});
  astro.stderr.on("data", () => {});

  try {
    await waitForReady(`${ORIGIN}/`);
    console.log("[fallback] Astro ready.");

    const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const launchOpts = { headless: true };
    if (existsSync(systemChrome)) launchOpts.executablePath = systemChrome;
    const browser = await chromium.launch(launchOpts);
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1140 },
      deviceScaleFactor: 2,
    });

    page.on("pageerror", (e) => console.error("[page]", e.message));
    page.on("console", (m) => console.log(`[console:${m.type()}]`, m.text()));

    // Intercept a fake path on the dev origin so the driver page shares the
    // Astro dev server's origin — required for the ESM import to /src/lib/* to
    // pass CORS. setContent() would give us a `null` origin and the import
    // would be blocked.
    const DRIVER_URL = `${ORIGIN}/__diffusion_driver.html`;
    await page.route(DRIVER_URL, (route) => {
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: DRIVER_HTML });
    });
    await page.goto(DRIVER_URL, { waitUntil: "load" });
    await page.waitForFunction(() => window.__DIFFUSION_READY__ === true, { timeout: 30_000 });
    await page.waitForTimeout(400); // let GPU flush

    const handle = await page.locator("#c");
    const buf = await handle.screenshot({ omitBackground: false });
    await writeFile(OUT_PNG, buf);
    console.log(`[fallback] PNG written → ${OUT_PNG}`);

    await sharp(buf).webp({ quality: 85 }).toFile(OUT_WEBP);
    await sharp(buf).avif({ quality: 65 }).toFile(OUT_AVIF);
    console.log(`[fallback] WebP + AVIF written.`);

    await browser.close();
  } finally {
    astro.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("[fallback] failed:", err);
  process.exit(1);
});
