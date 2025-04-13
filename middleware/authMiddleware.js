const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret';

function verifyToken(req, res, next) {
  const bearerToken = req.headers['authorization'];
  const token = bearerToken?.startsWith("Bearer ") ? bearerToken.split(" ")[1] : bearerToken;

  if (!token) {
    return res.status(403).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('[AUTH ERROR] Invalid token:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded; // You can now access req.user in your routes
    next();
  });
}

module.exports = verifyToken; // Export the middleware function
// res.status(200).json({ token });