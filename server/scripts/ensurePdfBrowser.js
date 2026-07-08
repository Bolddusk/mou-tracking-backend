/**
 * Ensures a Chrome/Chromium binary exists for Puppeteer PDF export.
 * - Docker: system Chromium via apt (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true)
 * - Bare metal / PM2: downloads Puppeteer Chrome on npm install if system browser missing
 */
const { execSync } = require('child_process');
const fs = require('fs');

const SYSTEM_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter(Boolean);

function isExecutable(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return fs.statSync(filePath).isFile();
  }
}

function findSystemBrowser() {
  return SYSTEM_CANDIDATES.find(isExecutable) || null;
}

async function findBundledBrowser() {
  try {
    const puppeteer = require('puppeteer');
    const bundled = await puppeteer.executablePath();
    return isExecutable(bundled) ? bundled : null;
  } catch {
    return null;
  }
}

async function main() {
  const system = findSystemBrowser();
  if (system) {
    console.log(`[pdf] System browser found: ${system}`);
    return;
  }

  const bundled = await findBundledBrowser();
  if (bundled) {
    console.log(`[pdf] Puppeteer Chrome found: ${bundled}`);
    return;
  }

  if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true') {
    console.warn(
      '[pdf] WARNING: No browser for PDF export. Install Chromium on the server or unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD.'
    );
    return;
  }

  console.log('[pdf] No browser found — installing Puppeteer Chrome (one-time download)...');
  execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  console.log('[pdf] Puppeteer Chrome installed.');
}

main().catch((err) => {
  console.warn('[pdf] ensurePdfBrowser failed (PDF export may be unavailable):', err.message);
});
