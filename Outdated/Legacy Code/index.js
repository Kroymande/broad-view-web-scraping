const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Navigate to a sample website
  await page.goto('https://cloud.mongodb.com');

  // Extract the title
  const title = await page.title();

  // Extract meta description
  const metaDescription = await page.$eval('meta[name="description"]', element => element.content);

  console.log(`Title: ${title}`);
  console.log(`Meta Description: ${metaDescription}`);

  await browser.close();
})();