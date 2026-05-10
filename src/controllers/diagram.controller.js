const UserModel = require('../models/user.model');
const DiagramModel = require('../models/diagram.model');
const DiagramService = require('../services/diagram.service');

/**
 * Generate and save a new diagram
 * POST /api/diagram/generate
 * Body: { repo_name, diagram_type, title?, description?, branch_filter? }
 */
async function generateDiagram(req, res) {
  try {
    const userId = req.userId;
    const { repo_name, diagram_type, title, description, branch_filter } = req.body;
    
    if (!repo_name || !diagram_type) {
      return res.status(400).json({
        success: false,
        message: 'repo_name and diagram_type are required'
      });
    }
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if diagram already exists for this repo and type
    const existing = await DiagramModel.findByRepoAndType(userId, repo_name, diagram_type);
    
    // Generate new diagram
    const { diagramCode, sources, model } = await DiagramService.generateDiagram(
      repo_name,
      diagram_type,
      branch_filter
    );
    
    let result;
    const diagramTitle = title || `${repo_name} - ${diagram_type.toUpperCase()} Diagram`;
    const diagramDesc = description || `Auto-generated ${diagram_type} architecture diagram for ${repo_name}`;
    
    if (existing) {
      // Update existing
      await DiagramModel.update(existing.id, userId, diagramCode, diagramDesc);
      result = { ...existing, diagram_code: diagramCode, description: diagramDesc, updated_at: new Date().toISOString() };
      console.log(`📝 Updated existing ${diagram_type} diagram for ${repo_name}`);
    } else {
      // Create new
      result = await DiagramModel.create({
        user_id: userId,
        repo_name,
        diagram_type,
        title: diagramTitle,
        diagram_code: diagramCode,
        description: diagramDesc
      });
      console.log(`📝 Created new ${diagram_type} diagram for ${repo_name}`);
    }
    
    res.json({
      success: true,
      data: {
        id: result.id,
        repo_name: result.repo_name,
        diagram_type: result.diagram_type,
        title: result.title,
        diagram_code: result.diagram_code,
        description: result.description,
        sources,
        model,
        created_at: result.created_at,
        updated_at: result.updated_at,
        is_new: !existing
      }
    });
    
  } catch (error) {
    console.error('Generate diagram error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate diagram'
    });
  }
}

/**
 * Get all diagrams for the authenticated user
 * GET /api/diagram
 */
async function getUserDiagrams(req, res) {
  try {
    const userId = req.userId;
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const diagrams = await DiagramModel.findByUser(userId);
    
    res.json({
      success: true,
      data: {
        diagrams,
        total: diagrams.length
      }
    });
    
  } catch (error) {
    console.error('Get user diagrams error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get diagrams'
    });
  }
}

/**
 * Get diagrams for a specific repository
 * GET /api/diagram/repo/:repoName
 */
async function getDiagramsByRepo(req, res) {
  try {
    const { repoName } = req.params;
    const userId = req.userId;
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const diagrams = await DiagramModel.findByUser(userId);
    const repoDiagrams = diagrams.filter(d => d.repo_name === repoName);
    
    res.json({
      success: true,
      data: {
        diagrams: repoDiagrams,
        total: repoDiagrams.length
      }
    });
    
  } catch (error) {
    console.error('Get diagrams by repo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get diagrams'
    });
  }
}

/**
 * Get specific diagram by ID
 * GET /api/diagram/:id
 */
async function getDiagramById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const diagram = await DiagramModel.findById(id, userId);
    if (!diagram) {
      return res.status(404).json({
        success: false,
        message: 'Diagram not found'
      });
    }
    
    res.json({
      success: true,
      data: diagram
    });
    
  } catch (error) {
    console.error('Get diagram by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get diagram'
    });
  }
}

/**
 * Delete diagram
 * DELETE /api/diagram/:id
 */
async function deleteDiagram(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await DiagramModel.delete(id, userId);
    
    res.json({
      success: true,
      message: 'Diagram deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete diagram error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete diagram'
    });
  }
}

/**
 * Regenerate diagram
 * POST /api/diagram/regenerate/:id
 */
async function regenerateDiagram(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { branch_filter } = req.body;
    
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const existing = await DiagramModel.findById(id, userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Diagram not found'
      });
    }
    
    // Generate new diagram
    const { diagramCode, sources, model } = await DiagramService.generateDiagram(
      existing.repo_name,
      existing.diagram_type,
      branch_filter
    );
    
    // Update
    await DiagramModel.update(id, userId, diagramCode);
    
    res.json({
      success: true,
      data: {
        id: existing.id,
        diagram_code: diagramCode,
        sources,
        model,
        updated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Regenerate diagram error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to regenerate diagram'
    });
  }
}

module.exports = {
  generateDiagram,
  getUserDiagrams,
  getDiagramsByRepo,
  getDiagramById,
  deleteDiagram,
  regenerateDiagram
};