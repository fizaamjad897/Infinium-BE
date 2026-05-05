const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { getDashboardStats } = require('../controllers/dashboard.controller');

router.use(authMiddleware);
router.get('/stats', getDashboardStats);

module.exports = router;