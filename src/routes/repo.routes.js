const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  getUserRepos,
  getIndexedRepos,
  getRepoStatus,
  deleteRepo
} = require('../controllers/repo.controller');

// All routes require authentication
router.use(authMiddleware);

// Get all GitHub repos (with indexing status)
router.get('/', getUserRepos);

// Get only indexed repos
router.get('/indexed', getIndexedRepos);

// Get specific repo status
router.get('/:repoName/status', getRepoStatus);

// Delete indexed repo
router.delete('/:repoName', deleteRepo);

module.exports = router;