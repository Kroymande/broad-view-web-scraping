// app.js - Express API Server
const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const port = 3000;
const MONGO_URI = 'mongodb+srv://carl6690:wVkZUHvp61PDR9a9@broadviewdb.wcqud.mongodb.net/';
const DB_NAME = 'WebScraping_Database';
const cors = require('cors');

app.use(cors({
    origin: 'http://localhost:5173', // Change this if frontend runs on a different port
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json()); // Enables JSON body parsing for POST requests

// MongoDB Connection
async function connectToDb() {
    const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await client.connect();
    return client.db(DB_NAME);
}

// Serve static files (screenshots)
app.use('/screenshots', express.static(path.join(__dirname, 'public/screenshots')));

// API: Get all scan results (with totalLinks and deadLinks)
app.get('/api/scan-results', async (req, res) => {
    try {
        const db = await connectToDb();
        const results = await db.collection('scan_results').find().toArray();

        const formattedResults = results.map(result => ({
            url: result.url,
            title: result.title,
            totalLinks: result.totalLinks || 0,      // Total links found
            deadLinks: result.deadLinks || [],       // Dead links only
            screenshotUrl: result.screenshotUrl,
            scrapeTimeSeconds: result.scrapeTimeSeconds,
            timestamp: result.timestamp
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Failed to retrieve scan results:', error.message);
        res.status(500).json({ error: 'Failed to retrieve scan results.' });
    }
});

// API: Get single scan result by URL
app.get('/api/scan-results/:url', async (req, res) => {
    const url = req.params.url;
    try {
        const db = await connectToDb();
        const result = await db.collection('scan_results').findOne({ url });

        if (result) {
            const formattedResult = {
                url: result.url,
                title: result.title,
                totalLinks: result.totalLinks || 0,
                deadLinks: result.deadLinks || [],
                screenshotUrl: result.screenshotUrl,
                scrapeTimeSeconds: result.scrapeTimeSeconds,
                timestamp: result.timestamp
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

// API: Get all users
app.get('/api/users', async (req, res) => {
    try {
        const db = await connectToDb();
        const users = await db.collection('users').find().toArray();
        res.json(users);
    } catch (error) {
        console.error('Failed to retrieve users:', error.message);
        res.status(500).json({ error: 'Failed to retrieve users.' });
    }
});

// API: Get configurations
app.get('/api/configurations', async (req, res) => {
    try {
        const db = await connectToDb();
        const configs = await db.collection('configurations').find().toArray();
        res.json(configs);
    } catch (error) {
        console.error('Failed to retrieve configurations:', error.message);
        res.status(500).json({ error: 'Failed to retrieve configurations.' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'API is running smoothly.' });
});

// Root endpoint for quick testing
app.get('/', (req, res) => {
    res.send('Broad View - AI-Assisted Website Service Analytics API is running!');
});

app.post('/scrape', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        // Call the scraper function from main.js
        const { scrapeWebsite } = require('./main.js');
        await scrapeWebsite(url);

        res.json({ message: 'Scraping started successfully!', url });
    } catch (error) {
        console.error('Error scraping website:', error.message);
        res.status(500).json({ error: 'Failed to start scraping' });
    }
});

// Start Express server
app.listen(port, () => {
    console.log(`Express app running at http://localhost:${port}`);
});