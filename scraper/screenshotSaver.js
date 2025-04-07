const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, '../public/screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

async function saveScreenshot(page, url) {
    const hostname = new URL(url).hostname.replace(/\./g, '-');
    const filename = `screenshot-${hostname}.png`;
    const screenshotPath = path.join(screenshotDir, filename);
    await page.screenshot({ path: screenshotPath });

    // Convert screenshot to base64
    const screenshotBase64 = fs.readFileSync(screenshotPath, { encoding: 'base64' });

    return {
        screenshotPath,
        screenshotUrl: `/screenshots/${filename}`,
        screenshotBase64 
    };
}

module.exports = { saveScreenshot };
