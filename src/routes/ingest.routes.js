const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  startIngestion,
  getIngestionStatus
} = require('../controllers/ingest.controller');

// All routes require authentication
router.use(authMiddleware);

// Start ingestion for a repository
router.post('/', startIngestion);

// Get ingestion status
router.get('/:repoName/status', getIngestionStatus);

module.exports = router;