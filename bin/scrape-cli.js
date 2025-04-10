#!/usr/bin/env node

// bin/scrape-cli.js
const scrapeWebsite = require('../scraper/scrapeWebsite');

const url = process.argv[2];

if (!url) {
    console.error("Please provide a URL to scrape.");
    console.error("Usage: node bin/scrape-cli.js <url>");
    process.exit(1);
}

(async () => {
    try {
        console.log(`Scraping: ${url}`);
        const result = await scrapeWebsite(url);
        console.log("Scrape Result:");
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Scraping failed:", err.message);
    }
})();