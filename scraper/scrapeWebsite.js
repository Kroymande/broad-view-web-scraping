const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { getCentralTime, categorizeStatusCode, determineBatchSize } = require('./utils');
const { saveScreenshot } = require('./screenshotSaver');
const { handlePopups } = require('./popupHandler');
const isLoginScreen = require('./loginDetector');
const { checkLinksParallel } = require('./linkChecker');
const { connectToDb } = require('../db/dbConnect');
const { logErrorToDb, logWarningToDb } = require('../db/logger');

const screenshotDir = path.join(__dirname, '../public/screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

async function scrapeWebsite(url) {
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
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    result.status = response?.status?.() || 500;

    const loginDetected = await isLoginScreen(page);
    if (loginDetected) {
      result.status = 403;
      result.error = 'Login screen detected, skipping scrape.';
      await logWarningToDb(db, 'Forced login detected', url);
      return result;
    }

    await handlePopups(page, db);

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

    result.title = await page.title();
    result.metaDescription = await page.$eval("meta[name='description']", el => el.content).catch(() => '');
    result.canonical = await page.$eval("link[rel='canonical']", el => el.href).catch(() => '');
    result.robotsMeta = await page.$eval("meta[name='robots']", el => el.content).catch(() => '');

    result.headers = await page.$$eval('h1, h2, h3', els =>
      els.map(el => ({ tag: el.tagName, text: (el.textContent || '').trim() })).filter(h => h.text.length > 0)
    );

    const screenshotData = await saveScreenshot(page, url);
    result.screenshotUrl = screenshotData.screenshotUrl;
    result.screenshotBase64 = screenshotData.screenshotBase64;

    const links = await page.$$eval('a[href]', anchors =>
      anchors
        .map(a => a.href)
        .filter(href => href.startsWith('http') && !href.includes('mailto:') && !href.includes('tel:') && !href.includes('#'))
    );
    result.allLinks = links;
    result.totalLinks = links.length;

    const linkResults = await checkLinksParallel(links, browser, db);
    result.deadLinks = linkResults?.filter(l => l.category !== 'valid') || [];

    result.scrapeTimeSeconds = ((Date.now() - start) / 1000).toFixed(2);
    result.status = 200;

    await db.collection('scan_results').insertOne(result);
    return result;
  } catch (err) {
    console.error(`[SCRAPER] Fatal error during scrape: ${err.message}`);
    result.status = 500;
    result.error = err.message;
    await logErrorToDb(db, err.message, url);
    return result;
  } finally {
    if (browser) await browser.close();
    if (client) await client.close();
  }
}

module.exports = scrapeWebsite;