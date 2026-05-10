const { supabaseAdmin } = require('../config/supabase');

class BranchIndexModel {
  
  static async create(data) {
    const { data: branchIndex, error } = await supabaseAdmin
      .from('branch_indexes')
      .insert([{
        user_id: data.user_id,
        repo_name: data.repo_name,
        repo_url: data.repo_url,
        full_name: data.full_name,
        status: 'pending',
        branches_list: data.branches_list || [],
        branches_count: data.branches_list?.length || 0,
        language: data.language,
        stars: data.stars || 0
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create branch index: ${error.message}`);
    return branchIndex;
  }

  static async findByRepoName(repoName, userId) {
    const { data, error } = await supabaseAdmin
      .from('branch_indexes')
      .select('*')
      .eq('repo_name', repoName)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) return null;
    return data;
  }

  static async findByUser(userId) {
    const { data, error } = await supabaseAdmin
      .from('branch_indexes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) return [];
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
    if (stats.branches_count !== undefined) updateData.branches_count = stats.branches_count;
    if (stats.branches_list !== undefined) updateData.branches_list = stats.branches_list;
    if (stats.error_message) updateData.error_message = stats.error_message;
    
    const { error } = await supabaseAdmin
      .from('branch_indexes')
      .update(updateData)
      .eq('repo_name', repoName)
      .eq('user_id', userId);
    
    if (error) console.error('Update branch index error:', error);
  }

  static async delete(repoName, userId) {
    const { error } = await supabaseAdmin
      .from('branch_indexes')
      .delete()
      .eq('repo_name', repoName)
      .eq('user_id', userId);
    
    if (error) return false;
    return true;
  }
}

module.exports = BranchIndexModel;