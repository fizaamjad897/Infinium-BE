const { supabaseAdmin } = require('../config/supabase');

class ConversationModel {
  
  static async create(userId, repoName, title = null) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert([{
        user_id: userId,
        repo_name: repoName,
        title: title || `Chat about ${repoName}`
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return data;
  }

  static async findByUser(userId) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get conversations: ${error.message}`);
    return data;
  }

  static async findById(conversationId, userId) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw new Error(`Failed to get conversation: ${error.message}`);
    return data;
  }

  // ... rest of the methods (addMessage, getMessages, delete, updateTitle) stay the same
  
  static async addMessage(conversationId, role, content, sources = null, modelUsed = null, tokensUsed = null) {
    const { data, error } = await supabaseAdmin
      .from('conversation_messages')
      .insert([{
        conversation_id: conversationId,
        role: role,
        content: content,
        sources: sources,
        model_used: modelUsed,
        tokens_used: tokensUsed
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to add message: ${error.message}`);
    
    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    return data;
  }

  static async getMessages(conversationId) {
    const { data, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) throw new Error(`Failed to get messages: ${error.message}`);
    return data;
  }

  static async delete(conversationId, userId) {
    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);
    
    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
    return true;
  }

  static async updateTitle(conversationId, title) {
    const { error } = await supabaseAdmin
      .from('conversations')
      .update({ title: title })
      .eq('id', conversationId);
    
    if (error) throw new Error(`Failed to update title: ${error.message}`);
  }
}

module.exports = ConversationModel;