const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  getUserRepos,
  getIndexedRepos,
  getRepoStatus,
  deleteRepo,
  getRepoTree,
  getRepoFile
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

// File tree (with functions per file) for the Code Refactor UI
router.get('/:repoName/tree', getRepoTree);

// Single file content + symbols for the Code Refactor viewer
router.get('/:repoName/file', getRepoFile);

module.exports = router;