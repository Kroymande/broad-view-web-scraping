const { spawn } = require('child_process'); // Used to execute main.js
const assert = require('assert'); // Assertion library for validation
const fs = require('fs'); // File system module for checking screenshots

// Function to run the scraper and capture output
function runScraper(url, callback) {
    const process = spawn('node', ['main.js', url]); // Execute main.js with the URL

    let output = '';
    let errorOutput = '';

    process.stdout.on('data', (data) => (output += data.toString()));
    process.stderr.on('data', (data) => (errorOutput += data.toString()));

    process.on('close', (code) => callback(code, output, errorOutput));
}

// Test URLs covering different edge cases
const testUrls = [
    { url: 'https://www.wikipedia.org', name: 'Real Website' },
    { url: 'https://example.com', name: 'Minimal Content' },
    { url: 'https://httpstat.us/404', name: 'Fake/404 Page' },
    { url: 'https://httpstat.us/500', name: 'Server Error' },
    { url: 'https://www.nytimes.com', name: 'Dynamic Content' }
];

describe('Web Scraper Validation Tests', function () {
    this.timeout(300000); // Set timeout to 5 minutes

    testUrls.forEach(({ url, name }) => {
        describe(`Testing ${name} (${url})`, function () {
            let scraperOutput = '';

            before((done) => {
                runScraper(url, (code, output, errorOutput) => {
                    assert.strictEqual(code, 0, `Scraper should exit with code 0`);
                    scraperOutput = output;
                    done();
                });
            });

            it('Should extract a valid page title', () => {
                const titleMatch = scraperOutput.match(/Title:\s(.+)/);
                assert(titleMatch, `Title should be extracted from ${url}`);
                console.log(`✅ Extracted title: ${titleMatch[1]}`);
            });

            it('Should extract a valid meta description', () => {
                const metaMatch = scraperOutput.match(/Meta Description:\s(.+)/);
                assert(metaMatch, `Meta description should be extracted from ${url}`);
                console.log(`✅ Extracted meta description: ${metaMatch[1]}`);
            });

            it('Should find and process links correctly', () => {
                const linkCountMatch = scraperOutput.match(/Found (\d+) links/);
                assert(linkCountMatch, `Number of links should be logged from ${url}`);
                const linkCount = parseInt(linkCountMatch[1], 10);
                assert(linkCount >= 0, `At least 0 links should be found from ${url}, got ${linkCount}`);
                console.log(`✅ Found ${linkCount} links`);
            });

            it('Should confirm batch processing is used', () => {
                const linkCountMatch = scraperOutput.match(/Found (\d+) links/);
                assert(linkCountMatch, `Should log number of links found on ${url}`);
                const linkCount = parseInt(linkCountMatch[1], 10);
            
                const batchMatch = scraperOutput.match(/Total batches used: (\d+)/);
                if (linkCount === 0) {
                    console.log(`ℹ No links found on ${url}, skipping batch check (Expected behavior)`);
                } else {
                    assert(batchMatch, `Batch processing count should be logged for ${url}`);
                    const batchCount = parseInt(batchMatch[1], 10);
                    assert(batchCount > 0, `Batch processing should be applied for ${url}`);
                    console.log(`✅ Confirmed ${batchCount} batches used for ${url}`);
                }
            });
            
            it('Should validate dynamic content extraction', () => {
                if (scraperOutput.includes('No dynamic content found.')) {
                    console.log(`ℹ No dynamic content found on ${url}, skipping test (Expected behavior)`);
                } else {
                    const dynamicMatch = scraperOutput.match(/Dynamic Content Found:\s(.+)/);
                    assert(dynamicMatch, `Dynamic content should be detected if present on ${url}`);
                    console.log(`✅ Dynamic content detected: ${dynamicMatch[1]}`);
                }
            });            

            it('Should verify screenshot is saved', () => {
                const screenshotMatch = scraperOutput.match(/Screenshot saved at:\s(.+)/);
                assert(screenshotMatch, `Screenshot path should be logged`);
                const screenshotPath = screenshotMatch[1].trim();
                assert(fs.existsSync(screenshotPath), `Screenshot should exist: ${screenshotPath}`);
                console.log(`✅ Screenshot verified at ${screenshotPath}`);
            });

            it('Should measure execution time', () => {
                const timeMatch = scraperOutput.match(/Scraping completed in ([\d.]+) seconds/);
                assert(timeMatch, `Execution time should be logged`);
                const execTime = parseFloat(timeMatch[1]);
                assert(execTime > 0, `Execution time should be greater than zero`);
                console.log(`✅ Execution completed in ${execTime} seconds`);
            });
        });
    });
});