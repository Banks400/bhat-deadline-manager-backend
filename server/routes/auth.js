const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Discord OAuth callback
router.post('/discord-callback', (req, res) => {
    const { user_id, username } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const token = jwt.sign(
          { user_id, username },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '7d' }
        );
    res.json({ token, user: { user_id, username } });
  });

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
          req.user = decoded;
          next();
        } catch (error) {
          res.status(401).json({ error: 'Invalid token' });
        }
  };

router.get('/me', verifyToken, (req, res) => {
    res.json({ user: req.user });
  });

module.exports = router;
