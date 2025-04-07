const express = require('express');
const router = express.Router();

router.get('/api/health-check', (req, res) => {
  res.send('Server is running');
});

module.exports = router;