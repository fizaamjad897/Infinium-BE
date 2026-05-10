const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  uploadMiddleware,
  analyzePdf,
  getAnalysisHistory,
  getAnalysisById,
  deleteAnalysis
} = require('../controllers/pdf.controller');

// All routes require authentication
router.use(authMiddleware);

// Analyze PDF (file upload)
router.post('/analyze', uploadMiddleware, analyzePdf);

// Get analysis history
router.get('/history', getAnalysisHistory);

// Get specific analysis
router.get('/history/:id', getAnalysisById);

// Delete analysis
router.delete('/history/:id', deleteAnalysis);

module.exports = router;