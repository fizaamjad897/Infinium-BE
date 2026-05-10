const { supabaseAdmin } = require('../config/supabase');

class PdfAnalysisModel {
  
  static async create(data) {
    const { data: analysis, error } = await supabaseAdmin
      .from('pdf_analyses')
      .insert([{
        user_id: data.user_id,
        file_name: data.file_name,
        file_size: data.file_size,
        summary: data.summary,
        key_entities: data.key_entities || [],
        requirements: data.requirements || [],
        recommendations: data.recommendations || [],
        technologies: data.technologies || [],
        full_analysis: data.full_analysis
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to save analysis: ${error.message}`);
    return analysis;
  }

  static async findByUser(userId, limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('pdf_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw new Error(`Failed to get analyses: ${error.message}`);
    return data;
  }

  static async findById(id, userId) {
    const { data, error } = await supabaseAdmin
      .from('pdf_analyses')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw new Error(`Failed to get analysis: ${error.message}`);
    return data;
  }

  static async delete(id, userId) {
    const { error } = await supabaseAdmin
      .from('pdf_analyses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw new Error(`Failed to delete analysis: ${error.message}`);
    return true;
  }
}

module.exports = PdfAnalysisModel;