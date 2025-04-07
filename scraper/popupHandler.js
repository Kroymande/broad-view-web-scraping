const { logWarningToDb } = require('../db/logger');

async function handlePopups(page, db) {
    try {
        await page.evaluate(() => {
            const clickFirst = (text) => {
                const btns = document.evaluate(`//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text}')]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (btns.snapshotLength > 0) {
                    btns.snapshotItem(0).click();
                    return true;
                }
                return false;
            };
            clickFirst("accept") || clickFirst("ok") || clickFirst("close");
            document.querySelectorAll('.paywall, .cookie-consent, .popup-modal, div[role="dialog"]').forEach(e => e.remove());
        });
    } catch (err) {
        await logWarningToDb(db, `Popup handling failed: ${err.message}`);
    }
}

module.exports = { handlePopups };