const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  generateDiagram,
  getUserDiagrams,
  getDiagramsByRepo,
  getDiagramById,
  deleteDiagram,
  regenerateDiagram
} = require('../controllers/diagram.controller');

router.use(authMiddleware);

router.post('/generate', generateDiagram);
router.get('/', getUserDiagrams);
router.get('/repo/:repoName', getDiagramsByRepo);
router.get('/:id', getDiagramById);
router.delete('/:id', deleteDiagram);
router.post('/regenerate/:id', regenerateDiagram);

module.exports = router;