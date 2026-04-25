const { supabaseAdmin } = require('../config/supabase');

/**
 * User Model - Handles all database operations for users table
 */
class UserModel {
  
  /**
   * Create a new user (email/password registration)
   * @param {Object} userData - { email, username, full_name, password_hash }
   * @returns {Promise<Object>} - Created user
   */
  static async create(userData) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([{
        email: userData.email,
        username: userData.username,
        full_name: userData.full_name || userData.username,
        password_hash: userData.password_hash,
        auth_provider: 'email',
        email_verified: false,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create user: ${error.message}`);
    return data;
  }

  /**
   * Create a GitHub OAuth user
   * @param {Object} githubData - { github_id, email, username, full_name, avatar_url, access_token }
   * @returns {Promise<Object>} - Created user
   */
  static async createFromGithub(githubData) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([{
        github_id: githubData.github_id,
        email: githubData.email,
        username: githubData.username,
        full_name: githubData.full_name || githubData.username,
        avatar_url: githubData.avatar_url,
        github_access_token: githubData.access_token,
        auth_provider: 'github',
        email_verified: true,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create GitHub user: ${error.message}`);
    return data;
  }

  /**
   * Find user by email (for login)
   * @param {string} email - User's email address
   * @returns {Promise<Object|null>} - User or null
   */
  static async findByEmail(email) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid PGRST116 error
    
    if (error) {
      console.error('Find by email error:', error);
      return null;
    }
    return data;
  }

  /**
   * Find user by username
   * @param {string} username - User's username
   * @returns {Promise<Object|null>} - User or null
   */
  static async findByUsername(username) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    
    if (error) {
      console.error('Find by username error:', error);
      return null;
    }
    return data;
  }

  /**
   * Find user by GitHub ID
   * @param {number} githubId - GitHub user ID
   * @returns {Promise<Object|null>} - User or null
   */
  static async findByGithubId(githubId) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('github_id', githubId)
      .maybeSingle();
    
    if (error) {
      console.error('Find by GitHub ID error:', error);
      return null;
    }
    return data;
  }

  /**
   * Find user by ID (UUID)
   * @param {string} id - User's UUID
   * @returns {Promise<Object|null>} - User or null
   */
  static async findById(id) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, username, full_name, avatar_url, auth_provider, created_at, last_login_at')
      .eq('id', id)
      .maybeSingle();
    
    if (error) {
      console.error('Find by ID error:', error);
      return null;
    }
    return data;
  }

/**
 * Update user's last login timestamp
 * @param {string} id - User's UUID
 * @returns {Promise<void>}
 */
static async updateLastLogin(id) {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString()
        // Removed login_count since it doesn't exist in your table
      })
      .eq('id', id);
    
    if (error) {
      console.error('Update last login error:', error);
      // Don't throw - login still works even if this fails
    }
  } catch (error) {
    console.error('Update last login error:', error);
    // Don't throw - login still works
  }
}


  /**
   * Update GitHub user's access token
   * @param {number} githubId - GitHub user ID
   * @param {string} accessToken - New GitHub access token
   * @returns {Promise<void>}
   */
  static async updateGithubToken(githubId, accessToken) {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ github_access_token: accessToken })
      .eq('github_id', githubId);
    
    if (error) {
      console.error('Update GitHub token error:', error);
      // Don't throw - not critical
    }
  }

  /**
   * Get user profile (safe for API response - excludes sensitive data)
   * @param {string} id - User's UUID
   * @returns {Promise<Object|null>} - Safe user profile
   */
  static async getProfile(id) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, username, full_name, avatar_url, auth_provider, created_at')
      .eq('id', id)
      .maybeSingle();
    
    if (error) {
      console.error('Get profile error:', error);
      return null;
    }
    return data;
  }
}

module.exports = UserModel;