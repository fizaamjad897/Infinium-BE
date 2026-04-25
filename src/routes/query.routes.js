const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  askQuestion,
  startConversation,
  getConversations,
  getConversation,
  deleteConversation
} = require('../controllers/query.controller');

// All routes require authentication
router.use(authMiddleware);

// Query endpoints
router.post('/query', askQuestion);

// Conversation endpoints
router.post('/conversation', startConversation);
router.get('/conversation', getConversations);
router.get('/conversation/:id', getConversation);
router.delete('/conversation/:id', deleteConversation);

module.exports = router;