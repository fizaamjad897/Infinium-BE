const { supabaseAdmin } = require('../config/supabase');

class RepositoryModel {

  static async create(repoData) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .insert([{
        repo_name: repoData.repo_name,
        repo_url: repoData.repo_url,
        full_name: repoData.full_name,
        user_id: repoData.user_id,  // ← ONLY user_id, no owner_github_id needed
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

  static async findByRepoName(repoName, userId) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .select('*')
      .eq('repo_name', repoName)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Find repository error:', error);
      return null;
    }
    return data;
  }

  static async findByOwner(userId) {
    const { data, error } = await supabaseAdmin
      .from('repositories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Find repos by owner error:', error);
      return [];
    }
    return data;
  }

  static async updateStatus(repoName, userId, status, stats = {}) {
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
      .eq('user_id', userId);

    if (error) {
      console.error('Update repository status error:', error);
    }
  }

  static async delete(repoName, userId) {
    const { error } = await supabaseAdmin
      .from('repositories')
      .delete()
      .eq('repo_name', repoName)
      .eq('user_id', userId);

    if (error) {
      console.error('Delete repository error:', error);
      return false;
    }
    return true;
  }

  static async exists(repoName, userId) {
    const repo = await this.findByRepoName(repoName, userId);
    return !!repo;
  }
}

module.exports = RepositoryModel;