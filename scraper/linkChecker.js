const isLoginScreen = require('./loginDetector');
const { categorizeStatusCode } = require('./utils');

const knownLoginSites = ["facebook.com", "linkedin.com", "instagram.com"];

async function checkLinksParallel(links, browser, db) {
    console.log(`[LINK CHECKER] Checking ${links.length} links in parallel...`);
    const maxTabs = 4;
    const results = [];

    for (let i = 0; i < links.length; i += maxTabs) {
        const chunk = links.slice(i, i + maxTabs);
        console.log(`[LINK CHECKER] Processing chunk of ${chunk.length} links...`);
        const pages = await Promise.all(chunk.map(() => browser.newPage()));

        const statuses = await Promise.all(chunk.map((link, idx) =>
            checkLinkStatus(link, pages[idx], db).finally(() => pages[idx].close().catch(() => {}))
        ));

        results.push(...statuses);
    }

    console.log(`[LINK CHECKER] Completed link checking. Total results: ${results.length}`);
    return results.filter(Boolean); // Remove nulls
}

async function checkLinkStatus(link, page, db, retries = 3) {
    console.log(`[LINK CHECKER] Checking link: ${link}`);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const status = res?.status?.() || 500;

            if (knownLoginSites.some(domain => link.includes(domain))) {
                console.log(`[LINK CHECKER] Login required for link: ${link}`);
                return { url: link, status: 403, category: 'login_required' };
            }

            const login = await isLoginScreen(page);
            if (login) {
                console.log(`[LINK CHECKER] Login screen detected for link: ${link}`);
                return { url: link, status: 403, category: 'login_required' };
            }

            const category = categorizeStatusCode(status);
            console.log(`[LINK CHECKER] Link checked: ${link}, Status: ${status}, Category: ${category}`);
            return { url: link, status, category };
        } catch (err) {
            console.error(`[LINK CHECKER] Error checking link: ${link}, Attempt: ${i + 1}, Error: ${err.message}`);
            if (i === retries - 1) {
                return { url: link, status: 0, category: 'dead', reason: "No response (timeout or error)" };
            }
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    return { url: link, status: 0, category: 'unknown' };
}

module.exports = { checkLinksParallel };