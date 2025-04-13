const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const scrapeWebsite = require('../scraper/scrapeWebsite');
const { connectToDb } = require('../db/dbConnect');
const { logErrorToDb } = require('../db/logger');

const validator = require('validator');

router.post('/scrape', verifyToken, async (req, res) => {
    const url = req.body.url?.trim();
    console.log('[SCRAPE] Incoming scrape request for:', url);

    const isValidUrl = validator.isURL(url, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_host: true,
        require_tld: true,
        allow_underscores: true,
        allow_trailing_dot: true,
    });

    if (!url || typeof url !== 'string' || !isValidUrl) {
        console.warn('[SCRAPE] Invalid URL input.');
        return res.status(400).json({ error: 'Invalid or missing URL.' });
    }

    try {
        const result = await scrapeWebsite(url);

        if (result.blockedByProtection) {
            return res.status(403).json({ error: 'Site is protected by anti-bot services like Cloudflare. Scan could not be completed.' });
        }      
            
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