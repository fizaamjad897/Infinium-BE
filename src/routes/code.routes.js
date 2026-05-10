const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { refactor } = require('../controllers/refactor.controller');

router.use(authMiddleware);

// POST /api/code/refactor
router.post('/refactor', refactor);

module.exports = router;
