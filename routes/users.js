const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectToDb } = require('../db/dbConnect');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { db } = await connectToDb();

    const normalizedEmail = email?.trim().toLowerCase();
    const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({ email: normalizedEmail, password: hashedPassword });
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
  const { email, password } = req.body;
  try {
    const { db } = await connectToDb();

    console.log('[LOGIN] Incoming request body:', req.body);

    const normalizedEmail = email?.trim().toLowerCase();
    console.log('[LOGIN] Normalized email:', normalizedEmail);

    const user = await db.collection('users').findOne({ email: normalizedEmail });
    console.log('[LOGIN] MongoDB matched user:', user);

    if (!user) {
      console.warn('[LOGIN] No user found with email:', normalizedEmail);
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.warn('[LOGIN] Invalid password attempt for:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ email: normalizedEmail }, JWT_SECRET, { expiresIn: '1h' });
    console.log('[LOGIN] Token generated for:', normalizedEmail);

    res.json({ token });
  } catch (err) {
    console.error('[LOGIN] Server error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/login', (req, res) => {
  res.status(405).json({ error: 'Method Not Allowed. Use POST for login.' });
});

module.exports = router;