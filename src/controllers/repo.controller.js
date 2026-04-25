const GitHubService = require('../services/github.service');
const RepositoryModel = require('../models/repository.model');
const UserModel = require('../models/user.model');

/**
 * Get all repositories for authenticated user (from GitHub API + local status)
 * GET /api/repos
 */
async function getUserRepos(req, res) {
  try {
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's GitHub token
    const fullUser = await UserModel.findByEmail(user.email);
    const githubToken = fullUser?.github_access_token;
    
    if (!githubToken) {
      return res.status(401).json({
        success: false,
        message: 'GitHub token not found. Please re-authenticate with GitHub.'
      });
    }

    // Fetch repos from GitHub API
    const githubRepos = await GitHubService.getUserRepos(githubToken);
    
    // Get already indexed repos from database
    const indexedRepos = await RepositoryModel.findByOwner(fullUser.github_id);
    const indexedRepoNames = new Set(indexedRepos.map(r => r.repo_name));

    // Merge data: add indexing status to each GitHub repo
    const reposWithStatus = githubRepos.map(repo => {
      const indexed = indexedRepoNames.has(repo.name);
      const indexedData = indexedRepos.find(r => r.repo_name === repo.name);
      
      return {
        ...repo,
        is_indexed: indexed,
        indexing_status: indexedData?.status || null,
        indexed_at: indexedData?.indexed_at || null,
        chunks_count: indexedData?.chunks_count || 0
      };
    });

    res.json({
      success: true,
      data: {
        repositories: reposWithStatus,
        total: reposWithStatus.length,
        indexed_count: indexedRepos.length
      }
    });
  } catch (error) {
    console.error('Get user repos error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch repositories'
    });
  }
}

/**
 * Get indexed repositories (only those in database)
 * GET /api/repos/indexed
 */
async function getIndexedRepos(req, res) {
  try {
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    const repos = await RepositoryModel.findByOwner(fullUser.github_id);

    res.json({
      success: true,
      data: {
        repositories: repos,
        total: repos.length
      }
    });
  } catch (error) {
    console.error('Get indexed repos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch indexed repositories'
    });
  }
}

/**
 * Get repository status
 * GET /api/repos/:repoName/status
 */
async function getRepoStatus(req, res) {
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

    const fullUser = await UserModel.findByEmail(user.email);
    const repo = await RepositoryModel.findByRepoName(repoName, fullUser.github_id);

    if (!repo) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found in index'
      });
    }

    res.json({
      success: true,
      data: repo
    });
  } catch (error) {
    console.error('Get repo status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch repository status'
    });
  }
}

/**
 * Delete indexed repository
 * DELETE /api/repos/:repoName
 */
async function deleteRepo(req, res) {
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

    const fullUser = await UserModel.findByEmail(user.email);
    const deleted = await RepositoryModel.delete(repoName, fullUser.github_id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Repository not found'
      });
    }

    res.json({
      success: true,
      message: 'Repository removed from index'
    });
  } catch (error) {
    console.error('Delete repo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete repository'
    });
  }
}

module.exports = {
  getUserRepos,
  getIndexedRepos,
  getRepoStatus,
  deleteRepo
};