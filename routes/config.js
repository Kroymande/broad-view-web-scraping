const express = require('express');
const router = express.Router();

router.get('/config', (req, res) => {
  res.json({ message: 'Configuration endpoint works.' });
});

module.exports = router;