const { supabaseAdmin } = require('../config/supabase');

/**
 * Repository Model - Handles all database operations for repositories table
 */
class RepositoryModel {
  
  /**
   * Create a new repository record
   * @param {Object} repoData - Repository data
   * @returns {Promise<Object>} - Created repository
   */
  static async create(repoData) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .insert([{
        repo_name: repoData.repo_name,
        repo_url: repoData.repo_url,
        full_name: repoData.full_name,
        owner_github_id: repoData.owner_github_id,
        status: 'pending',
        is_private: repoData.is_private || false,
        default_branch: repoData.default_branch || 'main',
        language: repoData.language,
        stars: repoData.stars || 0
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create repository: ${error.message}`);
    return data;
  }

  /**
   * Find repository by name and owner
   * @param {string} repoName - Repository name
   * @param {number} ownerGithubId - Owner's GitHub ID
   * @returns {Promise<Object|null>} - Repository or null
   */
  static async findByRepoName(repoName, ownerGithubId) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .select('*')
      .eq('repo_name', repoName)
      .eq('owner_github_id', ownerGithubId)
      .maybeSingle();
    
    if (error) {
      console.error('Find repository error:', error);
      return null;
    }
    return data;
  }

  /**
   * Get all repositories for a user
   * @param {number} ownerGithubId - Owner's GitHub ID
   * @returns {Promise<Array>} - List of repositories
   */
  static async findByOwner(ownerGithubId) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .select('*')
      .eq('owner_github_id', ownerGithubId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Find repos by owner error:', error);
      return [];
    }
    return data;
  }

  /**
   * Update repository status
   * @param {string} repoName - Repository name
   * @param {number} ownerGithubId - Owner's GitHub ID
   * @param {string} status - New status
   * @param {Object} stats - Optional stats (chunks_count, files_count, etc.)
   * @returns {Promise<void>}
   */
  static async updateStatus(repoName, ownerGithubId, status, stats = {}) {
    const updateData = {
      status: status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'completed') {
      updateData.indexed_at = new Date().toISOString();
    }
    
    if (stats.chunks_count !== undefined) updateData.chunks_count = stats.chunks_count;
    if (stats.files_count !== undefined) updateData.files_count = stats.files_count;
    if (stats.commits_count !== undefined) updateData.commits_count = stats.commits_count;
    if (stats.error_message) updateData.error_message = stats.error_message;
    
    const { error } = await supabaseAdmin
      .from('repositories')
      .update(updateData)
      .eq('repo_name', repoName)
      .eq('owner_github_id', ownerGithubId);
    
    if (error) {
      console.error('Update repository status error:', error);
    }
  }

  /**
   * Delete a repository
   * @param {string} repoName - Repository name
   * @param {number} ownerGithubId - Owner's GitHub ID
   * @returns {Promise<boolean>} - Success status
   */
  static async delete(repoName, ownerGithubId) {
    const { error } = await supabaseAdmin
      .from('repositories')
      .delete()
      .eq('repo_name', repoName)
      .eq('owner_github_id', ownerGithubId);
    
    if (error) {
      console.error('Delete repository error:', error);
      return false;
    }
    return true;
  }

  /**
   * Check if repository is already indexed
   * @param {string} repoName - Repository name
   * @param {number} ownerGithubId - Owner's GitHub ID
   * @returns {Promise<boolean>} - True if exists
   */
  static async exists(repoName, ownerGithubId) {
    const repo = await this.findByRepoName(repoName, ownerGithubId);
    return !!repo;
  }
}

module.exports = RepositoryModel;