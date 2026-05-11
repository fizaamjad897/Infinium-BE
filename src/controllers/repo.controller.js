const GitHubService = require('../services/github.service');
const RepositoryModel = require('../models/repository.model');
const UserModel = require('../models/user.model');
const PythonAgentService = require('../services/pythonAgent.service');

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
    
    // ========== CASE 1: GitHub User (has token) ==========
    if (githubToken) {
      // Fetch repos from GitHub API
      const githubRepos = await GitHubService.getUserRepos(githubToken);
      
      // Get standard indexed repos
      const indexedRepos = await RepositoryModel.findByOwner(user.id);
      
      // Get multi-branch indexed repos (Deep Index)
      const BranchIndexModel = require('../models/branchIndex.model');
      const branchIndices = await BranchIndexModel.findByUser(user.id);
      
      const indexedRepoNames = new Set([
        ...indexedRepos.map(r => r.repo_name),
        ...branchIndices.map(r => r.repo_name)
      ]);

      // Merge data: add indexing status to each GitHub repo
      const reposWithStatus = githubRepos.map(repo => {
        const indexed = indexedRepoNames.has(repo.name);
        
        // Prefer branch index data if it exists and is completed/indexing
        const branchData = branchIndices.find(r => r.repo_name === repo.name);
        const standardData = indexedRepos.find(r => r.repo_name === repo.name);
        
        const bestData = (branchData && branchData.status !== 'failed') ? branchData : standardData;
        
        return {
          ...repo,
          is_indexed: indexed || (branchData?.status === 'completed'),
          indexing_status: bestData?.status || null,
          indexed_at: bestData?.indexed_at || null,
          chunks_count: bestData?.chunks_count || 0,
          has_branch_index: branchData?.status === 'completed',
          indexed_branches: branchData?.branches_list || (standardData?.default_branch ? [standardData.default_branch] : [])
        };
      });

      return res.json({
        success: true,
        data: {
          repositories: reposWithStatus,
          total: reposWithStatus.length,
          indexed_count: indexedRepoNames.size
        }
      });
    }
    
    // ========== CASE 2: Email User (no GitHub token) ==========
    // Only return manually indexed repositories
    const indexedRepos = await RepositoryModel.findByOwner(user.id);
    const BranchIndexModel = require('../models/branchIndex.model');
    const branchIndices = await BranchIndexModel.findByUser(user.id);
    
    // Convert to same format as GitHub repos for consistent frontend handling
    const manualRepos = indexedRepos.map(repo => ({
      id: repo.id,
      name: repo.repo_name,
      full_name: repo.full_name || repo.repo_name,
      private: repo.is_private || false,
      html_url: repo.repo_url || `https://github.com/${repo.full_name}`,
      clone_url: repo.repo_url,
      description: repo.description || "Manually indexed repository",
      language: repo.language,
      stars: repo.stars || 0,
      forks: 0,
      default_branch: repo.default_branch || 'main',
      updated_at: repo.updated_at,
      size: 0,
      is_indexed: true,
      indexing_status: repo.status,
      indexed_at: repo.indexed_at,
      chunks_count: repo.chunks_count || 0,
      has_branch_index: false,
      indexed_branches: [repo.default_branch || 'main']
    }));

    // Add branch-indexed repos for email users
    const branchRepos = branchIndices.map(br => ({
      id: br.id,
      name: br.repo_name,
      full_name: br.full_name || br.repo_name,
      private: br.private || false,
      html_url: br.repo_url || `https://github.com/${br.full_name}`,
      clone_url: br.repo_url,
      description: br.description || "Multi-branch indexed repository",
      language: br.language,
      stars: br.stars || 0,
      forks: 0,
      default_branch: br.default_branch || (br.branches_list?.[0]) || 'main',
      updated_at: br.updated_at,
      size: 0,
      is_indexed: true,
      indexing_status: br.status,
      indexed_at: br.indexed_at,
      chunks_count: br.chunks_count || 0,
      has_branch_index: true,
      indexed_branches: br.branches_list || []
    }));

    // Merge both types (standard and branch-indexed)
    const allRepos = [...manualRepos, ...branchRepos];
    
    // Deduplicate by repo_name (in case same repo has both)
    const uniqueRepos = new Map();
    allRepos.forEach(repo => {
      if (!uniqueRepos.has(repo.name) || (repo.has_branch_index && !uniqueRepos.get(repo.name).has_branch_index)) {
        uniqueRepos.set(repo.name, repo);
      }
    });

    res.json({
      success: true,
      data: {
        repositories: Array.from(uniqueRepos.values()),
        total: uniqueRepos.size,
        indexed_count: uniqueRepos.size
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
    const standardRepos = await RepositoryModel.findByOwner(user.id);
    
    // Merge with branch indices
    const BranchIndexModel = require('../models/branchIndex.model');
    const branchIndices = await BranchIndexModel.findByUser(user.id);
    
    // Create a map by repo name to deduplicate, favoring branch indices
    const mergedMap = new Map();
    
    standardRepos.forEach(r => {
      mergedMap.set(r.repo_name, { 
        ...r, 
        has_branch_index: false,
        indexed_branches: [r.default_branch || 'main']
      });
    });
    
    branchIndices.forEach(br => {
        if (mergedMap.has(br.repo_name)) {
            const existing = mergedMap.get(br.repo_name);
            mergedMap.set(br.repo_name, {
                ...existing,
                chunks_count: Math.max(existing.chunks_count || 0, br.chunks_count || 0),
                files_count: Math.max(existing.files_count || 0, br.files_count || 0),
                commits_count: Math.max(existing.commits_count || 0, br.commits_count || 0),
                is_indexed: true,
                indexing_status: br.status === 'completed' ? 'completed' : existing.indexing_status,
                has_branch_index: true,
                indexed_branches: br.branches_list || []
            });
        } else {
            mergedMap.set(br.repo_name, {
                ...br,
                name: br.repo_name,
                full_name: br.full_name || br.repo_name,
                html_url: br.repo_url || `https://github.com/${br.full_name}`,
                description: br.description || "Multi-branch indexed repository",
                default_branch: br.default_branch || (br.branches_list?.[0]) || "main",
                stars: br.stars || 0,
                forks: 0,
                private: br.private || false,
                is_indexed: true,
                indexing_status: br.status,
                has_branch_index: true,
                indexed_branches: br.branches_list || []
            });
        }
    });

    const repos = Array.from(mergedMap.values());

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
    const repo = await RepositoryModel.findByRepoName(repoName, user.id);

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
    const BranchIndexModel = require('../models/branchIndex.model');

    // 1. Wipe ChromaDB collection + Python ingestion-status entry.
    //    Run this first so a partial failure doesn't leave orphaned vectors.
    try {
      await PythonAgentService.deleteRepo(repoName, fullUser?.github_access_token);
    } catch (e) {
      console.warn(`⚠️ Python agent delete failed for ${repoName} — continuing with DB cleanup:`, e.message);
    }

    // 2. Delete from both standard and branch indices in our DB
    await RepositoryModel.delete(repoName, user.id);
    await BranchIndexModel.delete(repoName, user.id);

    res.json({
      success: true,
      message: 'Repository removed from index (ChromaDB + DB)'
    });
  } catch (error) {
    console.error('Delete repo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete repository'
    });
  }
}

/**
 * GET /api/repos/:repoName/tree?include_symbols=true
 */
async function getRepoTree(req, res) {
  try {
    const { repoName } = req.params;
    const includeSymbols = req.query.include_symbols !== 'false';
    const repoUrl = req.query.repo_url || null;
    const data = await PythonAgentService.getRepoTree(repoName, includeSymbols, repoUrl);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get repo tree error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/repos/:repoName/file?path=<rel/path>&repo_url=<optional>
 */
async function getRepoFile(req, res) {
  try {
    const { repoName } = req.params;
    const { path } = req.query;
    const repoUrl = req.query.repo_url || null;
    if (!path) {
      return res.status(400).json({ success: false, message: 'path query param is required' });
    }
    const data = await PythonAgentService.getRepoFile(repoName, path, repoUrl);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get repo file error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getUserRepos,
  getIndexedRepos,
  getRepoStatus,
  deleteRepo,
  getRepoTree,
  getRepoFile
};