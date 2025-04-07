const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectToDb } = require('../db/dbConnect');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { db } = await connectToDb();
    
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({ email: username, password: hashed });
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/register', (req, res) => {
  res.status(405).json({ error: 'Method Not Allowed. Use POST for registration.' });
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { db } = await connectToDb();
    const user = await db.collection('users').findOne({ email: username });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/login', (req, res) => {
  res.status(405).json({ error: 'Method Not Allowed. Use POST for login.' });
});

module.exports = router;