// Import Puppeteer
const puppeteer = require('puppeteer');

(async () => {
  try {
    // Launch Puppeteer browser instance
    const browser = await puppeteer.launch({ headless: true });

    // Open a new browser page
    const page = await browser.newPage();

    // Define the URL to navigate to
    const url = 'https://cloud.mongodb.com';

    // Set default navigation timeout to handle slow-loading pages
    await page.setDefaultNavigationTimeout(60000);

    // Navigate to the webpage and wait until the network is idle
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Take a screenshot for debugging purposes
    await page.screenshot({ path: 'debug_screenshot.png' });
    console.log('Screenshot saved to debug_screenshot.png');

    // Retrieve the page's raw HTML content
    const rawHTML = await page.content();
    console.log('Page HTML content retrieved successfully.');

    // Scrape dynamic content from the page
    const data = await page.evaluate(() => {
      // Select elements with the class "dynamic-content"
      const elements = Array.from(document.querySelectorAll('div.dynamic-content'));
      // Extract text content from each element
      return elements.map(el => el.textContent.trim());
    });

    // Log the extracted data
    console.log('Scraped Data:', data);

    // Close the browser
    await browser.close();
  } catch (error) {
    // Handle and log errors that occur during the scraping process
    console.error('An error occurred while handling dynamic content:', error);
  }
})();