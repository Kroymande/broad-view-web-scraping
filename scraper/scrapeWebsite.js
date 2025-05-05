const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { getCentralTime } = require('./utils');
const { saveScreenshot } = require('./screenshotSaver');
const { handlePopups } = require('./popupHandler');
const { checkLinksParallel } = require('./linkChecker');
const { connectToDb } = require('../db/dbConnect');
const { logErrorToDb, logWarningToDb } = require('../db/logger');

const screenshotDir = path.join(__dirname, '../public/screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

async function scrapeWebsite(url, isTestRun = false) {
  console.log(`[SCRAPER] Starting scrape for URL: ${url}`);
  const { db, client } = await connectToDb();
  let browser;

  const result = {
    url,
    timestamp: getCentralTime(),
    title: '',
    headers: [],
    metaDescription: '',
    canonical: '',
    robotsMeta: '',
    deadLinks: [],
    allLinks: [],
    totalLinks: 0,
    screenshotUrl: '',
    screenshotBase64: '',
    scrapeTimeSeconds: 0,
    status: 0
  };

  try {
    const start = Date.now();
    console.log('[SCRAPER] Launching browser...');
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const maxAttempts = 3;
    let attempt = 0;
    let response = null;

    while (attempt < maxAttempts) {
      try {
        console.log(`[SCRAPER] Attempt ${attempt + 1} to navigate to URL: ${url}`);
        response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        result.status = response?.status?.() || 500;
        break; // Success!
      } catch (err) {
        console.warn(`[SCRAPER] Attempt ${attempt + 1} failed: ${err.message}`);
        attempt++;
        if (attempt === maxAttempts) {
          result.status = 500;
          result.error = `Failed to load page after ${maxAttempts} attempts: ${err.message}`;
          console.error(`[SCRAPER] Max retries reached. Giving up on ${url}`);
          await logErrorToDb(db, result.error, url, attempt);
          return result; // Exit gracefully, no further processing
        }        
        await new Promise(r => setTimeout(r, 2000)); // delay before retry
      }
    }

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9"
    });
    
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.warn('[SCRAPER] Main frame navigated again to:', frame.url());
      }
    });

    page.on('requestfailed', request => {
      const failure = request.failure();
      console.warn(`[SCRAPER] Resource failed: ${request.url()} (${failure?.errorText || 'unknown error'})`);
    });

    page.on('console', msg => {
      console.log(`[SCRAPER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
    
    console.log(`[SCRAPER] Navigating to URL: ${url}`);   
    result.status = response?.status?.() || 500;
    console.log(`[SCRAPER] Page status: ${result.status}`);

    // Add a short delay to allow JavaScript to modify the DOM
     console.log('[SCRAPER] Adding delay to allow JavaScript to modify the DOM...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay

    console.log('[SCRAPER] Checking for robots meta tag...');
    const robotsMetaExists = await page.$("meta[name='robots']");
    if (robotsMetaExists) {
      let content = '';
      try {
        content = await page.evaluate(() => {
          const meta = document.querySelector("meta[name='robots']");
          return meta ? meta.content : null;
        });
      } catch (err) {
        console.warn('[SCRAPER] Failed to read robots meta:', err.message);
      }
      console.log(`[SCRAPER] Robots meta tag found: ${content}`);
      result.robotsMeta = content;
    } else {
      console.warn('[SCRAPER] Robots meta tag not found.');
      result.robotsMeta = 'Not available';
    }

    console.log('[SCRAPER] Handling popups...');
    await handlePopups(page, db);
    if (page.isClosed()) throw new Error('Page closed unexpectedly after popup handling');

    console.log('[SCRAPER] Scrolling through the page...');
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 200;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    } catch (err) {
      console.warn('[SCRAPER] Scrolling failed:', err.message);
    }    

    console.log('[SCRAPER] Extracting metadata...');
    result.title = await page.title();
    result.metaDescription = await page.$eval("meta[name='description']", el => el.content).catch(() => 'Not available');
    result.canonical = await page.$eval("link[rel='canonical']", el => el.href).catch(() => 'Not available');
    console.log(`[SCRAPER] Metadata extracted: Title: ${result.title}, Description: ${result.metaDescription}`);

    console.log('[SCRAPER] Extracting headers...');
    result.headers = await page.$$eval('h1, h2, h3', els =>
      els.map(el => ({ tag: el.tagName, text: (el.textContent || '').trim() })).filter(h => h.text.length > 0)
    );
    console.log(`[SCRAPER] Headers extracted: ${JSON.stringify(result.headers)}`);

    console.log('[SCRAPER] Taking screenshot...');
    const hostname = new URL(url).hostname.replace(/\./g, '-');
    const prefix = isTestRun ? 'test-screenshot-' : 'screenshot-';
    const screenshotData = await saveScreenshot(page, prefix + hostname);
    result.screenshotUrl = screenshotData.screenshotUrl;
    result.screenshotBase64 = screenshotData.screenshotBase64;
    console.log(`[SCRAPER] Screenshot saved: ${result.screenshotUrl}`);

    console.log('[SCRAPER] Extracting links...');
    const links = await page.$$eval('a[href]', anchors =>
      anchors
        .map(a => a.href)
        .filter(href => href.startsWith('http') && !href.includes('mailto:') && !href.includes('tel:') && !href.includes('#'))
    );
    result.allLinks = links;
    result.totalLinks = links.length;
    console.log(`[SCRAPER] Total links found: ${result.totalLinks}`);

    console.log('[SCRAPER] Checking links...');
    const linkResults = await checkLinksParallel(links, browser, db);
    result.deadLinks = linkResults?.filter(l => l.category !== 'valid') || [];

    // Build status code summary for visualization
    const statusSummary = {};
    linkResults.forEach(link => {
      const code = link.status?.toString() || 'unknown';
      if (!statusSummary[code]) statusSummary[code] = 0;
      statusSummary[code]++;
    });

    result.statusCodes = statusSummary;

    console.log(`[SCRAPER] Dead links found: ${result.deadLinks.length}`);

    try {
      const html = await page.content();
      fs.writeFileSync('debug.html', html);
      console.log('[SCRAPER] Saved DOM content to debug.html');
    } catch (err) {
      console.warn('[SCRAPER] Could not save DOM content:', err.message);
    }    

    result.scrapeTimeSeconds = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[SCRAPER] Scrape completed in ${result.scrapeTimeSeconds} seconds.`);

    // Detect Cloudflare/CAPTCHA or bot protection page
    if (result.status === 403 || result.title.toLowerCase().includes("just a moment")) {
      console.warn('[SCRAPER] Blocked by anti-bot protection (e.g., Cloudflare)');
      result.blockedByProtection = true;

      // Log it for analytics/debugging
      await logWarningToDb(db, 'Blocked by bot protection (Cloudflare)', url);

      return result; // Exit early without saving to DB
    }

    console.log('[SCRAPER] Validating result...');
    const isResultValid = (
      result.status === 200 &&
      result.title &&
      Array.isArray(result.allLinks) &&
      result.allLinks.length > 0 &&
      result.screenshotUrl &&
      result.screenshotBase64
    );

    if (isResultValid) {
      console.log('[SCRAPER] Inserting result into database...');
      await db.collection('scan_results').insertOne(result);
    } else {
      console.warn('[SCRAPER] Result is incomplete or invalid. Logging warning.');
      await logWarningToDb(db, 'Scrape returned incomplete or invalid data', url);
    }

    return result;

  } catch (err) {
    console.error(`[SCRAPER] Fatal error during scrape: ${err.message}`);
    result.status = 500;
    result.error = err.message;
    await logErrorToDb(db, err.message, url);
    return result;
  } finally {
    if (browser) {
      console.log('[SCRAPER] Closing browser...');
      await browser.close();
    }
    if (client) {
      console.log('[SCRAPER] Closing database connection...');
      await client.close();
    }
  }
}

module.exports = scrapeWebsite;