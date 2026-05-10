const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  submitFeedback,
  feedbackStats,
  listFeedback,
} = require('../controllers/feedback.controller');

router.use(authMiddleware);

// POST /api/feedback        — submit feedback
// GET  /api/feedback/stats  — aggregate stats (optional ?target_type=...)
// GET  /api/feedback        — list recent (optional ?target_type=&repo_name=&limit=)
router.post('/', submitFeedback);
router.get('/stats', feedbackStats);
router.get('/', listFeedback);

module.exports = router;
