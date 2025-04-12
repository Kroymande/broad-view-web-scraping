require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const scrapeRoutes = require('./routes/scrape');

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '25mb' }));
app.use('/api', scrapeRoutes);
app.use(express.urlencoded({ extended: true }));

// Static folder for screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'public/screenshots')));

// Modular routes
app.use('/api/scrape', require('./routes/scrape'));
app.use('/api/scans', require('./routes/scans'));
app.use('/api/users', require('./routes/users'));
app.use('/api/config', require('./routes/config'));
app.use('/api/health', require('./routes/health'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));