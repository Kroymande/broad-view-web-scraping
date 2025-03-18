// main.js - Web Scraper
const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

// MongoDB connection details
const MONGO_URI = 'mongodb+srv://carl6690:wVkZUHvp61PDR9a9@broadviewdb.wcqud.mongodb.net/';
const DB_NAME = 'WebScraping_Database';

// Ensure the 'public/screenshots' directory exists for saving screenshots
const screenshotDir = path.join(__dirname, 'public/screenshots');
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

// Convert UTC to Central Time (CT)
function getCentralTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',  // Central Time Zone
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false  // Use 24-hour format
    });
}

// MongoDB connection function
async function connectToDb() {
    const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await client.connect();
    return { db: client.db(DB_NAME), client };
}

// Log errors into MongoDB
async function logErrorToDb(db, errorMessage, link = '', retries = 0) {
    const errorDoc = {
        timestamp: getCentralTime(),
        type: 'ERROR',
        message: errorMessage,
        link: link,
        retries: retries
    };
    await db.collection('scan_results').insertOne(errorDoc);
}

// Log warnings into MongoDB
async function logWarningToDb(db, warningMessage, link = '', retries = 0) {
    const warningDoc = {
        timestamp: getCentralTime(),
        type: 'WARNING',
        message: warningMessage,
        link: link,
        retries: retries
    };
    await db.collection('scan_results').insertOne(warningDoc);
}

// Determine batch size based on system resources
function determineBatchSize() {
    const totalMemory = os.totalmem();
    const numCores = os.cpus().length;
    const loadAvg = os.loadavg()[0];

    if (loadAvg > numCores * 0.75) {
        return 15;
    } else if (totalMemory > 16 * 1024 * 1024 * 1024) {
        return 50;
    } else if (totalMemory > 8 * 1024 * 1024 * 1024) {
        return 30;
    } else if (numCores > 4) {
        return 25;
    } else {
        return 20;
    }
}

// Handle popups, cookie banners, and modal overlays
async function handlePopups(page, db) {
    try {
        const popupHandled = await page.evaluate(() => {
            let clicked = false;
            function clickFirstMatchingButton(buttonText) {
                const buttons = document.evaluate(
                    `//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${buttonText}')]`,
                    document,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                if (buttons.snapshotLength > 0) {
                    buttons.snapshotItem(0).click();
                    return true;
                }
                return false;
            }
            clicked = clickFirstMatchingButton("accept") ||
                      clickFirstMatchingButton("close") ||
                      clickFirstMatchingButton("ok");
            const modalElements = document.querySelectorAll('.paywall, .cookie-consent, .popup-modal, div[role="dialog"]');
            modalElements.forEach(el => el.remove());
            return clicked;
        });
    } catch (error) {
        await logWarningToDb(db, `Popup handling failed: ${error.message}`);
    }
}

// Check link status and collect dead links only
async function checkLinkStatus(link, page, db, retryCount = 3) {
    for (let attempt = 0; attempt < retryCount; attempt++) {
        try {
            const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
            if (response && response.status() === 200) {
                return null;  // Link is alive, no need to store
            }
        } catch (error) {
            if (attempt === retryCount - 1) {
                console.warn(`Dead link detected: ${link}`);
                return link;  // Store only dead links
            }
        }
        await new Promise(res => setTimeout(res, 2000));  // Retry delay
    }
    return null;
}

// Main scraping function integrated with MongoDB
async function scrapeWebsite(url) {
    const { db, client } = await connectToDb();
    let linkStatuses = [];  // Collect dead links

    try {
        const startTime = Date.now();
        const batchSize = determineBatchSize();

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        await page.setExtraHTTPHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'If-None-Match': '',
            'If-Modified-Since': ''
        });

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/110.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0'
        ];
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        await page.setDefaultNavigationTimeout(60000);
        await page.goto(url, { waitUntil: 'networkidle2' });
        await handlePopups(page, db);

        // Extract SEO metadata and links
        const seoData = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .sort((a, b) => a.localeCompare(b));

            return {
                title: document.title || "No title found",
                metaDescription: document.querySelector('meta[name="description"]')?.content || "No meta description found",
                canonical: document.querySelector('link[rel="canonical"]')?.href || "No canonical tag found",
                robotsMeta: document.querySelector('meta[name="robots"]')?.content || "No robots meta tag found",
                headers: Array.from(document.querySelectorAll('h1, h2, h3'))
                    .map(h => h.textContent.trim().replace(/\s+/g, ' ')),
                totalLinks: links.length,  // Store only the count of links
                links: links
            };
        });

        // Check link status and collect dead links
        for (const link of seoData.links) {
            const result = await checkLinkStatus(link, page, db);
            if (result) {
                linkStatuses.push(result);  // Collect only dead links
            }
        }

        // Save screenshot and generate accessible URL
        const hostname = new URL(url).hostname.replace(/\./g, '-');
        const screenshotPath = path.join(screenshotDir, `screenshot-${hostname}.png`);
        await page.screenshot({ path: screenshotPath });
        const screenshotUrl = `/screenshots/screenshot-${hostname}.png`;

        await browser.close();

        const endTime = Date.now();
        const resultData = {
            url: url,
            title: seoData.title,
            metaDescription: seoData.metaDescription,
            canonical: seoData.canonical,
            robotsMeta: seoData.robotsMeta,
            headers: seoData.headers,
            totalLinks: seoData.totalLinks,  // Store only the count of links
            deadLinks: linkStatuses,  // Store only dead links
            screenshotUrl: screenshotUrl,
            scrapeTimeSeconds: (endTime - startTime) / 1000,
            timestamp: getCentralTime()  // Central Time timestamp
        };

        await db.collection('scan_results').insertOne(resultData);
        console.log('Scan result saved successfully.');
    } catch (error) {
        console.error("Error during scraping:", error.message);
    } finally {
        await client.close();
    }
}

const url = process.argv[2] || 'https://www.wikipedia.org';
scrapeWebsite(url);