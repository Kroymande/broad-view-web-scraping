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

async function autoScroll(page) {
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
    } catch (error) {
        console.warn(`[WARN] autoScroll failed due to page navigation: ${error.message}`);
    }
}

// Detect if the page requires login and determine if it's forced
async function isLoginScreen(page) {
    return await page.evaluate(() => {
        const passwordFields = document.querySelectorAll('input[type="password"]').length > 0;
        const loginKeywords = ['login', 'sign in', 'authenticate', 'log in'];
        const textContent = document.body.innerText.toLowerCase();

        // Detect login elements
        const hasLoginElements = passwordFields || loginKeywords.some(keyword => textContent.includes(keyword));

        // Detect if most content is hidden (e.g., blurred, display: none)
        const hiddenElements = document.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [style*="opacity: 0"]');
        const isContentHidden = hiddenElements.length > 15; // Adjusted threshold

        // Ensure key content is missing
        const mainContent = document.querySelector('main, article, section');
        const visibleHeadlines = document.querySelectorAll('h1, h2, h3, p, img').length > 5;

        // Detect if the page redirects to a login page
        const currentUrl = window.location.href.toLowerCase();
        const loginPaths = ['/login', '/signin', '/auth', '/account/signin'];
        const isRedirectedToLogin = loginPaths.some(path => currentUrl.includes(path));

        return {
            hasLoginElements,
            isContentHidden,
            isRedirectedToLogin,
            forcedLogin: hasLoginElements && isContentHidden && !mainContent && !visibleHeadlines
        };
    });
}

// Categorize HTTP status codes
function categorizeStatusCode(status) {
    if (status >= 200 && status < 300) return 'valid';
    if (status >= 300 && status < 400) return 'redirect';
    if (status >= 400 && status < 500) return 'client_error';
    if (status >= 500) return 'server_error';
    return 'unknown';
}

async function checkLinksParallel(links, browser, db) {
    const MAX_CONCURRENT_TABS = Math.max(2, Math.floor(os.cpus().length / 2));  // Adjust based on CPU power
    const linkStatuses = [];
    const linkChunks = [];
    const linksCopy = [...links];  // Prevent modifying original links array

    while (linksCopy.length) linkChunks.push(linksCopy.splice(0, MAX_CONCURRENT_TABS));

    for (const chunk of linkChunks) {
        const pages = [];
        for (let i = 0; i < chunk.length; i++) {
            pages.push(await browser.newPage());
            await new Promise(resolve => setTimeout(resolve, 500)); // Slow down tab creation
        }

        const tasks = chunk.map(async (link, index) => {
            try {
                const result = await checkLinkStatus(link, pages[index], db);
                return result;
            } finally {
                await pages[index].close();  // Close the page after check
            }
        });

        const results = await Promise.all(tasks);  // Process links in parallel
        linkStatuses.push(...results.filter(res => res));  // Collect dead links
    }

    return linkStatuses;
}

const knownLoginSites = [
    "facebook.com", "twitter.com", "linkedin.com", "instagram.com",
    "youtube.com", "threads.net", "mstdn.social", "bsky.app", "guce.techcrunch.com",
    "oidc.techcrunch.com", "legal.yahoo.com"
];

// Check link status, detect login screens, and collect non-alive links only
async function checkLinkStatus(link, page, db, retryCount = 3) {
    for (let attempt = 0; attempt < retryCount; attempt++) {
        try {
            console.log(`[DEBUG] Attempt ${attempt + 1} to access ${link}`);
            let response;
        try {
            response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (error) {
            console.error(`[ERROR] Failed to access ${link}: ${error.message}`);
        }

        // Ensure response is defined before calling status()
        const status = response && response.status ? response.status() : 500;
        if (!response) {
            console.warn(`[WARN] No response received for ${link}, defaulting status code to 500.`);
        }

            if (response) {
                const category = categorizeStatusCode(status);
                console.log(`[INFO] Categorized ${link}: Status ${status}, Category ${category}`);

                // Check if navigation occurs before evaluating login
                try {
                    await page.waitForNavigation({ timeout: 3000 }); // Reduce timeout
                    console.warn(`[INFO] Navigation detected at ${link}, delaying evaluation.`);
                } catch (navError) {
                    console.log(`[INFO] No navigation detected at ${link}, continuing.`);
                }

                // Ignore known login-required external sites
                if (knownLoginSites.some(domain => link.includes(domain))) {
                    console.warn(`[INFO] Skipping known login-restricted external site: ${link}`);
                    return null;
                }

                // Check for forced login only if navigation didn't happen
                const loginCheck = await isLoginScreen(page);

                if (loginCheck.forcedLogin) {
                    console.warn(`[WARN] Detected forced login at ${link}, categorizing as 'login_required'.`);
                    return { url: link, status: 403, category: 'login_required' };
                }

                // Store only non-alive links
                if (category !== 'valid') {
                    return { url: link, status, category };
                }

                return null; // Ignore valid links
            }
        } catch (error) {
            console.error(`[ERROR] Failed to access ${link} on attempt ${attempt + 1}: ${error.message}`);

            if (attempt === retryCount - 1) {
                console.warn(`[WARN] Dead link detected: ${link}`);
                return {
                    url: link,
                    status: 0,
                    category: 'dead',
                    reason: "No response received (Timeout, Unreachable, or Blocked)"
                };
            }
        }

        await new Promise(res => setTimeout(res, 2000)); // Retry delay
    }

    console.warn(`[WARN] Could not determine status for ${link}, marking as unknown.`);
    return {
        url: link,
        status: 0,
        category: 'unknown',
        reason: "No response received, unable to classify"
    };
}

// Main scraping function integrated with MongoDB
async function scrapeWebsite(url) {
    const { db, client } = await connectToDb();
    let browser;
    let response;
    
    try {
        const startTime = Date.now();
        console.log(`[INFO] Launching Puppeteer for: ${url}`);

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--disable-features=site-per-process',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        await page.setExtraHTTPHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'If-None-Match': '',
            'If-Modified-Since': ''
        });

        // Try to load the page, ensuring the response is defined
        try {
            response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
            console.log(`[INFO] Page loaded: ${url}`);
        } catch (error) {
            console.error(`[ERROR] Failed to load page: ${url} - ${error.message}`);
            return { error: "Failed to load page", url: url, statusCode: 500 };
        }

        // Extract status code safely
        const statusCode = response && response.status ? response.status() : 500;
        console.log(`[INFO] HTTP Status Code: ${statusCode} for ${url}`);

        // Check if the page requires login
        const loginCheck = await isLoginScreen(page);
        if (loginCheck.forcedLogin) {
            console.warn(`[WARN] Forced login detected at ${url}. Stopping scraping.`);
            await db.collection('scan_results').insertOne({
                url,
                status: 403,
                category: 'login_required',
                reason: "Forced login detected (content hidden or redirect)",
                timestamp: getCentralTime()
            });

            return { error: "Login required", url: url, statusCode: 403 };
        }

        await handlePopups(page, db);

        // Extract SEO and other page details
        const seoData = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(href => typeof href === 'string' && href.startsWith('http')) // Ensures valid links
                .sort((a, b) => a.localeCompare(b));

            return {
                title: document.title || "No title found",
                metaDescription: document.querySelector('meta[name="description"]')?.content || "No meta description found",
                canonical: document.querySelector('link[rel="canonical"]')?.href || "No canonical tag found",
                robotsMeta: document.querySelector('meta[name="robots"]')?.content || "No robots meta tag found",
                headers: Array.from(document.querySelectorAll('h1, h2, h3'))
                    .map(h => h.textContent.trim().replace(/\s+/g, ' ')),
                totalLinks: links.length,
                links: links
            };
        });

        const deadLinks = seoData.links?.length ? await checkLinksParallel(seoData.links, browser, db) : [];

        // Save screenshot
        const hostname = new URL(url).hostname.replace(/\./g, '-');
        const screenshotPath = path.join(screenshotDir, `screenshot-${hostname}.png`);
        await page.screenshot({ path: screenshotPath });
        const screenshotUrl = `/screenshots/screenshot-${hostname}.png`;

        const endTime = Date.now();

        const resultData = {
            url: url,
            statusCode: statusCode,
            title: seoData.title,
            metaDescription: seoData.metaDescription,
            canonical: seoData.canonical,
            robotsMeta: seoData.robotsMeta,
            headers: seoData.headers,
            totalLinks: seoData.totalLinks,
            deadLinks: deadLinks,  
            screenshotUrl: screenshotUrl,
            scrapeTimeSeconds: (endTime - startTime) / 1000,
            timestamp: getCentralTime()
        };

        await db.collection('scan_results').insertOne(resultData);
        console.log(`[INFO] Scan result saved successfully for: ${url}`);
        
        return resultData;

    } catch (error) {
        console.error("[ERROR] Scraping failed:", error.message);
        return { error: "Scraping failed due to an internal error.", url: url, statusCode: 500 };
    } finally {
        if (browser) {
            console.log("[INFO] Closing Puppeteer session...");
            await browser.close();
        }
        if (client) await client.close();
    }
}

const url = process.argv[2] || 'https://www.wikipedia.org';
module.exports = { scrapeWebsite };