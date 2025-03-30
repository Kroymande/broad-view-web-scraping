// app.js - Express API Server
const express = require('express');
const { MongoClient } = require('mongodb');
const { scrapeWebsite } = require('./main'); // Import the scraping function
const path = require('path');

const app = express();
const port = 3000;
const MONGO_URI = 'mongodb+srv://carl6690:wVkZUHvp61PDR9a9@broadviewdb.wcqud.mongodb.net/';
const DB_NAME = 'WebScraping_Database';
const cors = require('cors');

console.log(require('./main'));

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
    return { db: client.db(DB_NAME), client };
}

// Serve static files (screenshots)
app.use('/screenshots', express.static(path.join(__dirname, 'public/screenshots')));

// API: Get all scan results (with totalLinks and deadLinks)
app.get('/api/scan-results', async (req, res) => {
    try {
        const { db, client } = await connectToDb();
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
    const url = decodeURIComponent(req.params.url); // Decode the URL to handle special characters
    try {
        const { db, client } = await connectToDb();
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
        const { db, client } = await connectToDb();
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
        const { db, client } = await connectToDb();
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

const bcrypt = require('bcrypt'); // Import bcrypt for password hashing

app.post('/signup', async (req, res) => {
    let client;
    try {
        const connection = await connectToDb();
        client = connection.client;
        const db = connection.db;
        const usersCollection = db.collection('users');

        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required." });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format." });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Hash password before storing it
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user with hashed password
        const result = await usersCollection.insertOne({ name, email, password: hashedPassword });

        res.status(201).json({
            message: "User created successfully!",
            userId: result.insertedId, // Return the MongoDB generated user ID
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        if (client && typeof client.close === 'function') {
            await client.close();
        }        
    }
});

app.post('/login', async (req, res) => {
    try {
        const { db, client } = await connectToDb();
        const usersCollection = db.collection('users');

        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        // Check if the user exists
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "User not found." });
        }

        // Validate password using bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid password." });
        }

        res.json({ message: "Login successful!", user: { name: user.name, email: user.email } });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

app.post('/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: "URL is required" });
        }

        console.log(`[INFO] Received scraping request for: ${url}`);
        
        const scrapeResult = await scrapeWebsite(url);

        if (scrapeResult && scrapeResult.statusCode) {
            console.log("[INFO] Scrape completed successfully. Sending response...");
            return res.status(scrapeResult.statusCode).json(scrapeResult);
        } else {
            console.warn("[WARN] Scraping completed, but no valid status code returned.");
            return res.status(500).json({ error: "Scraping completed, but no status code returned." });
        }
    } catch (error) {
        console.error("[ERROR] Scraping failed:", error.message);
        return res.status(500).json({ error: "An error occurred during scraping." });
    }
});

// Start Express server
app.listen(port, () => {
    console.log(`Express app running at http://localhost:${port}`);
});