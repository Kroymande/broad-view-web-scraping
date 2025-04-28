const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, '../public/screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

async function saveScreenshot(page, hostname) {
    const timestamp = Date.now();
    const filename = `${hostname}-${timestamp}.png`;
    const screenshotPath = path.join(screenshotDir, filename);

    await page.screenshot({ path: screenshotPath });
    const screenshotBase64 = fs.readFileSync(screenshotPath, { encoding: 'base64' });

    return {
        screenshotUrl: `/screenshots/${filename}`,
        screenshotBase64
    };
}

module.exports = { saveScreenshot };
