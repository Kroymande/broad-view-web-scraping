const { isLoginScreen } = require('./loginDetector');
const { categorizeStatusCode } = require('./utils');

const knownLoginSites = ["facebook.com", "linkedin.com", "instagram.com"];

async function checkLinksParallel(links, browser, db) {
    const maxTabs = 4;
    const results = [];

    for (let i = 0; i < links.length; i += maxTabs) {
        const chunk = links.slice(i, i + maxTabs);
        const pages = await Promise.all(chunk.map(() => browser.newPage()));

        const statuses = await Promise.all(chunk.map((link, idx) =>
            checkLinkStatus(link, pages[idx], db).finally(() => pages[idx].close().catch(() => {}))
        ));

        results.push(...statuses);
    }

    return results;
}

async function checkLinkStatus(link, page, db, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const status = res?.status?.() || 500;

            if (knownLoginSites.some(domain => link.includes(domain))) return null;

            const login = await isLoginScreen(page);
            if (login.forcedLogin) return { url: link, status: 403, category: 'login_required' };

            const category = categorizeStatusCode(status);
            return { url: link, status, category };


        } catch {
            if (i === retries - 1) {
                return { url: link, status: 0, category: 'dead', reason: "No response (timeout or error)" };
            }
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    return { url: link, status: 0, category: 'unknown' };
}

module.exports = { checkLinksParallel };