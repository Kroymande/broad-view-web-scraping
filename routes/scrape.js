const express = require('express');
const router = express.Router();
const scrapeWebsite = require('../scraper/scrapeWebsite');
const { connectToDb } = require('../db/dbConnect');
const { logErrorToDb } = require('../db/logger');

router.post('/scrape', async (req, res) => {
    const { url } = req.body;
    console.log('[SCRAPE] Incoming scrape request for:', url);

    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
        console.warn('[SCRAPE] Invalid URL input.');
        return res.status(400).json({ error: 'Invalid or missing URL.' });
    }

    try {
        const result = await scrapeWebsite(url);
        return res.status(result.status).json(result);
    } catch (err) {
        console.error('[SCRAPE] Critical failure:', err.message);
        try {
            const { db } = await connectToDb();
            await logErrorToDb(db, err.message, url);
        } catch (innerErr) {
            console.error('[SCRAPE] Failed to log to DB:', innerErr.message);
        }
        return res.status(500).json({ error: 'Internal scraping error.' });
    }
});

module.exports = router;