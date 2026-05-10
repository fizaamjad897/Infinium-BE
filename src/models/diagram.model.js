const { supabaseAdmin } = require('../config/supabase');

class DiagramModel {
  
  static async create(data) {
    const { data: diagram, error } = await supabaseAdmin
      .from('architecture_diagrams')
      .insert([{
        user_id: data.user_id,
        repo_name: data.repo_name,
        diagram_type: data.diagram_type,
        title: data.title,
        diagram_code: data.diagram_code,
        description: data.description
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to save diagram: ${error.message}`);
    return diagram;
  }

  static async findByUser(userId, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('architecture_diagrams')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw new Error(`Failed to get diagrams: ${error.message}`);
    return data;
  }

  static async findByRepoAndType(userId, repoName, diagramType) {
    const { data, error } = await supabaseAdmin
      .from('architecture_diagrams')
      .select('*')
      .eq('user_id', userId)
      .eq('repo_name', repoName)
      .eq('diagram_type', diagramType)
      .maybeSingle();
    
    if (error) throw new Error(`Failed to get diagram: ${error.message}`);
    return data;
  }

  static async findById(id, userId) {
    const { data, error } = await supabaseAdmin
      .from('architecture_diagrams')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw new Error(`Failed to get diagram: ${error.message}`);
    return data;
  }

  static async update(id, userId, diagramCode, description = null) {
    const updateData = {
      diagram_code: diagramCode,
      updated_at: new Date().toISOString()
    };
    if (description) updateData.description = description;
    
    const { error } = await supabaseAdmin
      .from('architecture_diagrams')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw new Error(`Failed to update diagram: ${error.message}`);
    return true;
  }

  static async delete(id, userId) {
    const { error } = await supabaseAdmin
      .from('architecture_diagrams')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw new Error(`Failed to delete diagram: ${error.message}`);
    return true;
  }
}

module.exports = DiagramModel;