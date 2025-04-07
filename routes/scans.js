const express = require('express');
const router = express.Router();
const { connectToDb } = require('../db/dbConnect');
const { scrapeWebsite } = require('../scraper/scrapeWebsite');

// GET all scan results
router.get('/scan-results', async (req, res) => {
    try {
        const { db } = await connectToDb();
        const results = await db.collection('scan_results').find().toArray();

        const formatted = results.map(result => ({
            url: result.url,
            title: result.title,
            totalLinks: result.totalLinks || 0,
            deadLinks: result.deadLinks || [],
            screenshotBase64: result.screenshotBase64 || null,
            scrapeTimeSeconds: result.scrapeTimeSeconds,
            timestamp: result.timestamp,
            metaDescription: result.metaDescription,
            canonical: result.canonical,
            robotsMeta: result.robotsMeta,
            headers: result.headers || [],
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Error fetching scans:', err);
        res.status(500).json({ error: 'Failed to retrieve scan results.' });
    }
});

router.get('/scan-results/:encodedUrl', async (req, res) => {
    const decodedUrl = decodeURIComponent(req.params.encodedUrl); // Corrected param name

    try {
        const { db } = await connectToDb();
        const result = await db.collection('scan_results').findOne({ url: decodedUrl });

        if (result) {
            const formattedResult = {
                url: result.url,
                title: result.title,
                totalLinks: result.totalLinks || 0,
                deadLinks: result.deadLinks || [],
                screenshotBase64: result.screenshotBase64 || null,
                scrapeTimeSeconds: result.scrapeTimeSeconds,
                timestamp: result.timestamp,
                metaDescription: result.metaDescription,
                canonical: result.canonical,
                robotsMeta: result.robotsMeta,
                headers: result.headers || [],
            };
            res.json(formattedResult);
        } else {
            res.status(404).json({ error: 'No scan result found for this URL.' });
        }
    } catch (error) {
        console.error('Failed to retrieve scan result:', error.message);
        res.status(500).json({ error: 'Failed to retrieve scan result.' });
    }
});

module.exports = router;