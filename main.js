// Import necessary modules
const puppeteer = require('puppeteer'); // Web scraping and automation library
const os = require('os'); // Provides information about the operating system
const path = require('path'); // Handles file paths

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

        console.log(popupHandled ? "✅ Popup handled successfully." : "ℹ️ No popups detected.");
    } catch (error) {
        console.warn("⚠️" + " Popup handling failed:", error.message);
    }
}

// Function to scrape website data
async function scrapeWebsite(url) {
    try {
        const startTime = Date.now(); // Start measuring processing time
        
        // Launch Puppeteer in headless mode (no visible UI)
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Set user-agent to mimic a real browser
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        
        // Set a timeout to prevent long waits
        await page.setDefaultNavigationTimeout(60000);
        
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' }); // Ensures the page is fully loaded
        await handlePopups(page); // Handle potential popups before proceeding

        // Extract title, meta description, and links, ensuring they are sorted alphabetically
        const { title, metaDescription, links } = await page.evaluate(() => {
            const title = document.title || "No title found";
            const metaDescription = document.querySelector('meta[name="description"]')?.content || "No meta description found";
            const links = Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .sort((a, b) => a.localeCompare(b)); // Sorting alphabetically
            return { title, metaDescription, links };
        });

        console.log("Scraped Data:");
        console.log(`Title: ${title}`);
        console.log(`Meta Description: ${metaDescription}`);

        const dynamicContent = await page.evaluate(() => {
            const selectors = [
                '.dynamic-content', '.live-update', '.breaking-news', '.update', 
                '.story-body', '.headline', '.summary', '.content-block', 
                'article', 'section', '[data-live]'
            ];
            const elements = selectors.flatMap(selector =>
                Array.from(document.querySelectorAll(selector))
            );
            return elements.map(el => el.textContent.trim()).filter(text => text.length > 0);
        });

        if (dynamicContent.length > 0) {
            console.log(`🔹 Dynamic Content Found: ${JSON.stringify(dynamicContent)}`);
        } else {
            console.log("ℹ No dynamic content found.");
        }

        console.log(`Found ${links.length} links. Processing...`);

        // Determine the optimal batch size based on system resources
        const batchSize = determineBatchSize();
        let batchCount = 0;
        let linkStatuses = [];

        // Function to check the status of a link
        async function checkLinkStatus(link) {
            try {
                const linkPage = await browser.newPage();
                const response = await linkPage.goto(link, { waitUntil: 'domcontentloaded' });
                const status = response.status();
                await linkPage.close();
                return { link, status, isDead: status >= 400 };
            } catch {
                return { link, status: 'Error', isDead: true };
            }
        }

        for (let i = 0; i < links.length; i += batchSize) {
            batchCount++;
            const batch = links.slice(i, i + batchSize);
            console.log(`🔄 Processing batch ${batchCount} of ${Math.ceil(links.length / batchSize)}...`);
            console.log(`🔹 Links in this batch:`, batch);
            const batchResults = await Promise.all(batch.map(checkLinkStatus));
            linkStatuses.push(...batchResults);
        }

        console.log(`✅ Total batches used: ${batchCount}`);
        
        // Extract the hostname to save a screenshot
        const hostname = new URL(url).hostname.replace(/\./g, '-');
        const screenshotPath = path.join(__dirname, `screenshot-${hostname}.png`);

        await page.screenshot({ path: screenshotPath });
        console.log(`📸 Screenshot saved at: ${screenshotPath}`);
        
        const endTime = Date.now();
        console.log(`✅ Scraping completed in ${(endTime - startTime) / 1000} seconds.`);
        
        console.log("🔹 Link list sorted for review:");
        linkStatuses.sort((a, b) => a.link.localeCompare(b.link)).forEach((item, index) => {
            console.log(`${index + 1}. ${item.link} - Status: ${item.status} - ${item.isDead ? 'Dead' : 'Alive'}`);
        });
        
        await browser.close();
    } catch (error) {
        console.error(`An error occurred while scraping ${url}:`, error);
    }
}

// Allow dynamic URL input from command line, defaulting to Wikipedia
const url = process.argv[2] || 'https://www.wikipedia.org';

// Start scraping
scrapeWebsite(url);