// Import the Puppeteer library for web scraping and automation
const puppeteer = require('puppeteer');

// Import the 'path' module to work with file and directory paths
const path = require('path');
const readline = require('readline'); // For user input

// Create a readline interface to prompt the user
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to prompt the user for batch size selection
function askBatchSize() {
    return new Promise((resolve) => {
        rl.question('Enter batch size (20 or 30): ', (input) => {
            const batchSize = parseInt(input);
            if (batchSize === 20 || batchSize === 30) {
                resolve(batchSize);
            } else {
                console.log("Invalid input! Defaulting to 20 links per batch.");
                resolve(20);
            }
        });
    });
}

// Main asynchronous function to scrape a given website
async function scrapeWebsite(url) {
    try {
        const batchSize = await askBatchSize(); // Ask the user for batch size
        rl.close(); // Close the readline interface

        // Start timing the execution
        const startTime = Date.now();

        // Launch a Puppeteer browser instance in headless mode
        const browser = await puppeteer.launch({ headless: true });

        // Create a new page (tab) in the browser
        const page = await browser.newPage();

        // Set a custom user-agent to mimic a regular browser
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );

        // Set the default timeout for navigation
        await page.setDefaultNavigationTimeout(60000);

        // Navigate to the provided URL and wait until the network is idle
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Extract the title, meta description, and links from the webpage
        const { title, metaDescription, links } = await page.evaluate(() => {
            const title = document.title || "No title found";
            const metaDescription = document.querySelector('meta[name="description"]')?.content || "No meta description found";
            const links = Array.from(document.querySelectorAll('a[href]')).map(anchor =>
                new URL(anchor.href, document.baseURI).href
            );
            return { title, metaDescription, links };
        });

        console.log("Scraped Data:");
        console.log(`Title: ${title}`);
        console.log(`Meta Description: ${metaDescription}`);
        console.log(`Found ${links.length} links. Processing in batches of ${batchSize}...`);

        let processedLinks = 0; // Track the number of processed links

        // Process links in batches
        for (let i = 0; i < links.length; i += batchSize) {
            const batch = links.slice(i, i + batchSize);
            console.log(`\nProcessing batch ${i / batchSize + 1}/${Math.ceil(links.length / batchSize)} (${batch.length} links)...`);

            const batchStatuses = await Promise.all(
                batch.map(async (link, index) => {
                    try {
                        const linkPage = await browser.newPage();
                        const response = await linkPage.goto(link, { waitUntil: 'domcontentloaded' });
                        const status = response.status();
                        await linkPage.close();
                        return { link, status, isDead: status >= 400, index: i + index + 1 };
                    } catch {
                        return { link, status: 'Error', isDead: true, index: i + index + 1 };
                    }
                })
            );

            // Print results for this batch
            batchStatuses.forEach(({ link, status, isDead, index }) => {
                console.log(`${index}. ${link} - Status: ${status} - ${isDead ? 'Dead' : 'Alive'}`);
            });

            processedLinks += batch.length;
        }

        // Calculate total execution time
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Total Links Processed: ${processedLinks}`);
        console.log(`⏳ Total Time to Process: ${totalTime} seconds`);

        // Close the browser to release system resources
        await browser.close();
    } catch (error) {
        console.error(`An error occurred while scraping ${url}:`, error);
    }
}

// Define the URL to scrape
const url = 'https://www.wikipedia.org';

// Start the scraping process
scrapeWebsite(url);