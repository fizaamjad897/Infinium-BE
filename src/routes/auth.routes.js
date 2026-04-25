const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  register,
  login,
  getMe,
  githubLogin,
  githubCallback,
  logout
} = require('../controllers/auth.controller');

// Public routes (no authentication required)
router.post('/register', register);
router.post('/login', login);
router.get('/github', githubLogin);
router.get('/github/callback', githubCallback);

// Protected routes (authentication required)
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

module.exports = router;