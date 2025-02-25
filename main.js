// Import necessary modules
const puppeteer = require('puppeteer'); // Web scraping and automation library
const os = require('os'); // Provides information about the operating system
const path = require('path'); // Handles file paths
const fs = require('fs'); // File system module for logging errors

let loggedErrors = new Set(); // Ensure loggedErrors is initialized before use

// Function to log errors to error_log.txt
/**
 * Logs an error message to error_log.txt.
 * @param {string} errorMessage - The error message to log.
 * @param {string} [link=''] - The link associated with the error (optional).
 * @param {number} [retries=0] - The number of retries attempted (optional).
 */
function logErrorToFile(errorMessage, link = '', retries = 0) {
    const logFilePath = 'error_log.txt';
    const logEntry = `[${new Date().toISOString()}] [ERROR] ${errorMessage} | Link: ${link} | Retries: ${retries}\n`;
    fs.appendFileSync(logFilePath, logEntry, 'utf8');
    console.log(`Error logged to ${logFilePath}`);
}

// Function to log warnings to warning_log.txt
function logWarningToFile(warningMessage, link = '', retries = 0) {
    const warningFilePath = 'warning_log.txt';
    const logEntry = `[${new Date().toISOString()}] [WARNING] ${warningMessage} | Link: ${link} | Retries: ${retries}\n`;
    fs.appendFileSync(warningFilePath, logEntry, 'utf8');
    console.log(`Warning logged to ${warningFilePath}`);
}

// Function to determine the batch size based on available system resources and CPU load
function determineBatchSize() {
    const totalMemory = os.totalmem(); // Get total system memory in bytes
    const numCores = os.cpus().length; // Get the number of CPU cores
    const loadAvg = os.loadavg()[0]; // Get 1-minute CPU load average

    // Heuristic approach for batch size based on memory, CPU, and system load
    if (loadAvg > numCores * 0.75) {
        console.log(`High CPU load detected: ${loadAvg.toFixed(2)}. Using reduced batch size.`);
        return 15; // Reduce batch size under high load
    } else if (totalMemory > 16 * 1024 * 1024 * 1024) {
        return 50; // 16GB+ RAM, large batch
    } else if (totalMemory > 8 * 1024 * 1024 * 1024) {
        return 30; // 8-16GB RAM, medium batch
    } else if (numCores > 4) {
        return 25; // More than 4 cores, moderate batch
    } else {
        return 20; // Default batch size for low-end systems
    }
}

/* The async performs the following tasks:
1.) To work with Promises in a more synchronous manner.
2.) Asynchronous functions always return a Promise.
3.) The await keyword can only be used inside an async function, which 
pauses the execution of the function until the Promise is resolved.
4.) Also allows the use of .then() or catch() methods to handle the Promise.
*/

// Function to handle popups, cookie banners, and modal overlays
async function handlePopups(page) {
    try {
        if (!page || typeof page.evaluate !== 'function') {
            throw new Error("Invalid Puppeteer page instance.");
        }

        // Use page.evaluate() to handle popups dynamically
        const popupHandled = await page.evaluate(() => {
            let clicked = false;

            // Use XPath to find buttons containing "Accept", "Close", "OK"
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

            // Attempt to click pop-up buttons
            clicked = clickFirstMatchingButton("accept") ||
                clickFirstMatchingButton("close") ||
                clickFirstMatchingButton("ok");

            // Remove modal popups (e.g., paywalls, cookie banners)
            const modalElements = document.querySelectorAll('.paywall, .cookie-consent, .popup-modal, div[role="dialog"]');
            modalElements.forEach(el => el.remove());

            return clicked;
        });

        console.log(popupHandled ? "Popup handled successfully." : "No popups detected.");
    } catch (error) {
        logWarningToFile(`Popup handling failed: ${error.message}`);
    }
}

// Function to scrape website data with enhanced SEO extraction
async function scrapeWebsite(url) {
    try {
        const startTime = Date.now(); // Start measuring processing time
        const batchSize = determineBatchSize(); // Determine batch size based on system resources
        
        // Launch Puppeteer in headless mode (no visible UI)
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Additional headers to bypass caching and conditional requests
        await page.setCacheEnabled(false);
        await page.setExtraHTTPHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'If-None-Match': '', // ETag bypass
            'If-Modified-Since': '' // Prevent conditional GET
        });

        // Prevent ETag-based conditional requests
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const headers = req.headers();
            headers['If-None-Match'] = '';
            headers['If-Modified-Since'] = '';
            req.continue({ headers });
        });

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/110.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0'
        ];
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);        
        
        // Set a timeout to prevent long waits
        await page.setDefaultNavigationTimeout(60000);
        
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' }); // Ensures the page is fully loaded
        await handlePopups(page); // Handle potential popups before proceeding

        // Extract title, meta description, and links, ensuring they are sorted alphabetically
        const seoData = await page.evaluate(() => {
            return {
                title: document.title || "No title found",
                metaDescription: document.querySelector('meta[name="description"]')?.content || "No meta description found",
                canonical: document.querySelector('link[rel="canonical"]')?.href || "No canonical tag found",
                robotsMeta: document.querySelector('meta[name="robots"]')?.content || "No robots meta tag found",
                headers: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
                links: Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .sort((a, b) => a.localeCompare(b)), // Sorting links alphabetically
            };
        });

        console.log("\nExtracted SEO Metadata:");
        console.log(`Title: ${seoData.title}`);
        console.log(`Meta Description: ${seoData.metaDescription}`);
        console.log(`Canonical Tag: ${seoData.canonical}`);
        console.log(`Robots Meta: ${seoData.robotsMeta}`);
        console.log(`Headers Found: ${seoData.headers.length > 0 ? seoData.headers.join(" | ") : "No headers found"}`);
        console.log(`Found ${seoData.links.length} links (sorted alphabetically).`);

        // Extract meaningful dynamic content
        const dynamicContent = await page.evaluate(() => {
            const selectors = [
                '.main-content', '.article-content', '.news-article', '.post-content', // Common article containers
                '.live-update', '.breaking-news', '.headline', '.story-body', // News & updates
                '.summary', '.content-block', '[data-live]', // Other dynamic elements
                'article', 'section' // General content holders (filtered)
            ];

            // Get all elements from the defined selectors
            let elements = selectors.flatMap(selector =>
                Array.from(document.querySelectorAll(selector))
            );

            // Extract and clean text
            let extractedText = elements
                .map(el => el.textContent.trim())
                .filter(text => text.length > 20); // Ignore very short text (prevents junk data)

            // Remove duplicate content
            extractedText = [...new Set(extractedText)];

            return extractedText;
        });

        // Check and display extracted dynamic content
        if (dynamicContent.length > 0) {
            console.log(`Dynamic Content Extracted (${dynamicContent.length} sections):`);
            dynamicContent.forEach((text, index) => {
                console.log(`${index + 1}. ${text.substring(0, 150)}...`); // Show preview (first 150 chars)
            });
        } else {
            console.log("No meaningful dynamic content found.");
        }


        console.log(`Found ${seoData.links.length} links (sorted alphabetically). Processing...`);

        const MAX_CONCURRENT_PAGES = 5; // Number of pages to use in parallel
        let batchCount = 0;
        let linkStatuses = [];

        // Create a pool of Puppeteer pages
        const pagePool = await Promise.all(
            Array.from({ length: MAX_CONCURRENT_PAGES }, () => browser.newPage())
        );

        // Function to process a batch of links
        async function processBatch(batch) {
            return await Promise.all(batch.map(async (link, index) => {
                const page = pagePool[index % MAX_CONCURRENT_PAGES]; // Assign page from pool
                return await checkLinkStatus(link, page);
            }));
        }

        // Function to check the status of a link using retries and page pool
        async function checkLinkStatus(link, page, retryCount = 3) {
            let lastError = "";
            // Track attempts for logging
            let attemptLog = [];

            for (let attempt = 0; attempt < retryCount; attempt++) {
                try {
                    console.log(`Attempt ${attempt + 1} to access ${link}...`); // Log each attempt
                    attemptLog.push(`Attempt ${attempt + 1} to access ${link}`);
                    // Prevent race conditions
                    await new Promise(res => setTimeout(res, Math.random() * 3000)); // Random delay (0-3 sec)

                    const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });

                    if (response) {
                        const status = response.status();
                        const finalUrl = page.url(); // Capture final URL after redirects
                        console.log(`Response status for ${link} (Final URL: ${finalUrl}): ${status}`);
        
                        // Handle HTTP 304 as a warning
                        if (status === 304) {
                            logWarningToFile(`HTTP ${status} detected at ${finalUrl}.`, link, attempt + 1);
                            return { link, status, isDead: false, retries: attemptLog };
                        } else if (status !== 200) {
                            throw new Error(`HTTP ${status} detected at ${finalUrl}.`);
                        }
        
                        return { link, status, isDead: false, retries: attemptLog };
                    }
                } catch (error) {
                    lastError = error.message;
                    // Check case-insensitively for "aborted" in the error message
                    if (error.message.toLowerCase().includes('aborted')) {
                        console.warn(`ERR_ABORTED detected for ${link}. Retrying attempt ${attempt + 1} of ${retryCount}...`);
                        if (attempt === retryCount - 1) {
                            logWarningToFile(`Final ERR_ABORTED for ${link} after ${retryCount} attempts.`, link, attempt + 1);
                        }
                        continue;  // Retry without excessive logging
                    }
                
                    console.warn(`Failed attempt ${attempt + 1} for ${link}: ${error.message}`);
                    if (attempt === retryCount - 1 && !loggedErrors.has(link)) {
                        const errorMsg = `Failed to access ${link} after ${retryCount} attempts: ${lastError}`;
                        // If error message includes "aborted" or "HTTP 304", log as warning
                        if (lastError.toLowerCase().includes('aborted') || lastError.includes('HTTP 304')) {
                            logWarningToFile(errorMsg, link, attempt + 1);
                        } else {
                            logErrorToFile(errorMsg, link, attempt + 1);
                        }
                        loggedErrors.add(link);
                    }
                }

                await new Promise(res => setTimeout(res, 2000));  // 2-second fixed delay
            }

            console.warn(`Failed to access ${link} after ${retryCount} attempts.`);

            return {
                link,
                status: lastError.toLowerCase().includes('aborted') ? 'Aborted (Final)' :
                        lastError.includes('HTTP 304') ? 'Not Modified (304)' :
                        `Error - ${lastError}`,
                isDead: true,
                retries: attemptLog
            };
        }

        // Process links in batches
        if (seoData.links.length === 0) {
            console.warn(`No links found on ${url}. Skipping link checks.`);
        } else {
            for (let i = 0; i < seoData.links.length; i += batchSize) {
                batchCount++;
                const batch = seoData.links.slice(i, i + batchSize);
                console.log(`Processing batch ${batchCount} of ${Math.ceil(seoData.links.length / batchSize)}...`);
                console.log(`Links in this batch:`, batch);

                const batchResults = await processBatch(batch);
                linkStatuses.push(...batchResults);
            }
        }
        // Extract the hostname to save a screenshot
        const hostname = new URL(url).hostname.replace(/\./g, '-');
        const screenshotPath = path.join(__dirname, `screenshot-${hostname}.png`);

        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved at: ${screenshotPath}`);

        // Close all pages in the pool after processing
        for (const page of pagePool) {
            await page.close();
        }

        console.log(`Total batches used: ${batchCount}`);
        
        const endTime = Date.now();
        console.log(`Scraping completed in ${(endTime - startTime) / 1000} seconds.`);
        
        console.log("Link list sorted for review:");
        linkStatuses.sort((a, b) => a.link.localeCompare(b.link)).forEach((item, index) => {
            console.log(`${index + 1}. ${item.link} - Status: ${item.status} - ${item.isDead ? 'Dead' : 'Alive'}`);
        });
        
        await browser.close();
    } catch (error) {
        // Critical error - log to error_log.txt
        logErrorToFile(`An error occurred while scraping ${url}: ${error.message}`, url);
    }
}

// Allow dynamic URL input from command line, defaulting to Wikipedia
const url = process.argv[2] || 'https://www.wikipedia.org';
// Start scraping
scrapeWebsite(url);