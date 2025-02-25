const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');

function runScraper(url, callback) {
    if (!fs.existsSync('main.js')) {
        return callback(1, '', 'main.js does not exist or is not executable');
    }
    const child = spawn('node', ['main.js', url]); // Execute main.js with the URL

    child.on('error', (err) => {
        callback(1, '', `Failed to start process: ${err.message}`);
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => (output += data.toString()));
    child.stderr.on('data', (data) => (errorOutput += data.toString()));

    child.on('close', (code) => callback(code, output, errorOutput));
}

// Test URLs covering different edge cases
const testUrls = [
    { url: 'https://www.wikipedia.org', name: 'Real Website' },
    { url: 'https://example.com', name: 'Minimal Content' },
    { url: 'https://httpstat.us/404', name: 'Fake/404 Page' },
    { url: 'https://httpstat.us/500', name: 'Server Error' },
    { url: 'https://www.bbc.com/news', name: 'Dynamic Content' }
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

            it('Should extract canonical tag and robots meta data', () => {
                const canonicalMatch = scraperOutput.match(/Canonical Tag:\s(.+)/);
                assert(canonicalMatch, `Canonical tag should be extracted from ${url}`);
                console.log(`✅ Canonical tag detected: ${canonicalMatch[1]}`);

                const robotsMatch = scraperOutput.match(/Robots Meta:\s(.+)/);
                assert(robotsMatch, `Robots meta tag should be extracted from ${url}`);
                console.log(`✅ Robots meta tag detected: ${robotsMatch[1]}`);
            });

            it('Should detect and log headers', () => {
                const headersMatch = scraperOutput.match(/Headers Found:\s(.+)/);
                assert(headersMatch, `Headers should be extracted from ${url}`);
                console.log(`✅ Headers detected: ${headersMatch[1]}`);
            });

            it('Should handle popups and overlays', () => {
                assert(scraperOutput.includes("Popup handled successfully.") || scraperOutput.includes("No popups detected."),
                    `Popup handling should be confirmed for ${url}`);
                console.log(`✅ Popup handling validated.`);
            });

            it('Should confirm batch processing occurs', () => {
                const batchMatch = scraperOutput.match(/Total batches used: (\d+)/);
                assert(batchMatch, `Batch processing count should be logged for ${url}`);
                console.log(`✅ Confirmed ${batchMatch[1]} batches used.`);
            });

            it('Should verify retry mechanism on dead links', () => {
                const retryMatch = scraperOutput.match(/Attempt (\d+) to access/g);
                const retryCount = retryMatch ? retryMatch.length : 0;
            
                // Skip retry test for known error pages where no failed link attempts are expected.
                if (url.includes("httpstat.us/404") || url.includes("httpstat.us/500")) {
                    console.log(`ℹ Skipping retry mechanism test for ${url} because no failed link attempts are expected.`);
                    return;  // Skip this test for error pages
                }
                
                // Otherwise, assert retries occurred
                assert(retryCount > 0, `At least one retry attempt should be logged for failed links.`);
                console.log(`✅ Retry mechanism confirmed with ${retryCount} attempts.`);
            });

            it('Should validate extracted dynamic content', () => {
                if (scraperOutput.includes('No meaningful dynamic content found.')) {
                    console.log(`ℹ No dynamic content found on ${url}, skipping test (Expected behavior).`);
                } else {
                    const dynamicMatch = scraperOutput.match(/Dynamic Content Extracted \((\d+) sections\):/);
                    assert(dynamicMatch, `Dynamic content should be detected if present on ${url}`);
                    console.log(`✅ ${dynamicMatch[1]} dynamic content sections extracted.`);
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