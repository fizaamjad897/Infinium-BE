const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  askQuestion,
  startConversation,
  getConversations,
  getConversation,
  deleteConversation,
  askAllRepos,
} = require('../controllers/query.controller');

// All routes require authentication
router.use(authMiddleware);

// Query endpoints
router.post('/query', askQuestion);

// New endpoint to ask all repositories
router.post('/query/all', askAllRepos);

// Conversation endpoints
router.post('/conversation', startConversation);
router.get('/conversation', getConversations);
router.get('/conversation/:id', getConversation);
router.delete('/conversation/:id', deleteConversation);

module.exports = router;