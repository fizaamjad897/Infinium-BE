const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { 
    generateDocumentation, 
    getUserDocs, 
    getDocumentationById,
    deleteDocumentation 
} = require('../controllers/docs.controller');

// All routes require authentication
router.use(authMiddleware);

// Generate or regenerate documentation
router.post('/generate', generateDocumentation);

// Get all user documentation
router.get('/', getUserDocs);

// Get specific documentation by ID
router.get('/:id', getDocumentationById);

// Delete documentation
router.delete('/:id', deleteDocumentation);

module.exports = router;