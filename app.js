const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const scrapeRoutes = require('./routes/scrape');

dotenv.config();

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
app.use('/api', require ('./routes/scrape'));
app.use('/api', require('./routes/scans'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/config'));
app.use('/api', require('./routes/health'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));