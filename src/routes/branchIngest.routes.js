const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { startBranchIngestion, getBranchIngestionStatus } = require('../controllers/branchIngest.controller');

router.use(authMiddleware);

router.post('/', startBranchIngestion);
router.get('/:repoName/status', getBranchIngestionStatus);

module.exports = router;