const { supabaseAdmin } = require('../config/supabase');

class ConversationModel {
  
  /**
   * Create a new conversation
   * @param {number} userGithubId - User's GitHub ID
   * @param {string} repoName - Repository name
   * @param {string} title - Conversation title (optional)
   * @returns {Promise<Object>} - Created conversation
   */
  static async create(userGithubId, repoName, title = null) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert([{
        user_github_id: userGithubId,
        repo_name: repoName,
        title: title || `Chat about ${repoName}`
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return data;
  }

  /**
   * Get all conversations for a user
   * @param {number} userGithubId - User's GitHub ID
   * @returns {Promise<Array>} - List of conversations
   */
  static async findByUser(userGithubId) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_github_id', userGithubId)
      .order('updated_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get conversations: ${error.message}`);
    return data;
  }

  /**
   * Get a single conversation by ID
   * @param {string} conversationId - Conversation UUID
   * @param {number} userGithubId - User's GitHub ID (for verification)
   * @returns {Promise<Object|null>} - Conversation or null
   */
  static async findById(conversationId, userGithubId) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_github_id', userGithubId)
      .maybeSingle();
    
    if (error) throw new Error(`Failed to get conversation: ${error.message}`);
    return data;
  }

  /**
   * Add a message to a conversation
   * @param {string} conversationId - Conversation UUID
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @param {Object} sources - Optional sources from query
   * @param {string} modelUsed - LLM model used
   * @param {number} tokensUsed - Tokens consumed
   * @returns {Promise<Object>} - Created message
   */
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
    
    // Update conversation's updated_at timestamp
    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    return data;
  }

  /**
   * Get all messages in a conversation
   * @param {string} conversationId - Conversation UUID
   * @returns {Promise<Array>} - List of messages
   */
  static async getMessages(conversationId) {
    const { data, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) throw new Error(`Failed to get messages: ${error.message}`);
    return data;
  }

  /**
   * Delete a conversation and all its messages
   * @param {string} conversationId - Conversation UUID
   * @param {number} userGithubId - User's GitHub ID (for verification)
   * @returns {Promise<boolean>} - Success status
   */
  static async delete(conversationId, userGithubId) {
    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_github_id', userGithubId);
    
    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
    return true;
  }

  /**
 * Update conversation title
 * @param {string} conversationId - Conversation UUID
 * @param {string} title - New title
 * @returns {Promise<void>}
 */
static async updateTitle(conversationId, title) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ title: title })
    .eq('id', conversationId);
  
  if (error) throw new Error(`Failed to update title: ${error.message}`);
}
}

module.exports = ConversationModel;