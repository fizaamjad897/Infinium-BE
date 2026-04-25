const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const UserModel = require('../models/user.model');
const GitHubService = require('../services/github.service');

/**
 * Register a new user with email/password
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { email, username, password, full_name } = req.body;

    // Validation
    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, username, and password are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if email already exists
    const existingEmail = await UserModel.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Check if username already exists
    const existingUsername = await UserModel.findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username already taken'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await UserModel.create({
      email,
      username,
      full_name: full_name || username,
      password_hash: hashedPassword
    });

    // Generate JWT token
    const token = generateToken(user);

    // Return user profile (without sensitive data)
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          auth_provider: user.auth_provider
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Login user with email/password
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is email user (not GitHub user)
    if (user.auth_provider !== 'email') {
      return res.status(401).json({
        success: false,
        message: 'This account uses GitHub login. Please use "Login with GitHub" option.'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await UserModel.updateLastLogin(user.id);

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          auth_provider: user.auth_provider
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Get current authenticated user
 * GET /api/auth/me
 */
async function getMe(req, res) {
  try {
    const user = await UserModel.getProfile(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
}

/**
 * Initiate GitHub OAuth login
 * GET /api/auth/github
 */
function githubLogin(req, res) {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${process.env.GITHUB_CLIENT_ID}&` +
    `redirect_uri=${process.env.GITHUB_CALLBACK_URL}&` +
    `scope=repo,user:email,read:user`;
  
  // Redirect to GitHub for authorization
  res.redirect(githubAuthUrl);
}

/**
 * Handle GitHub OAuth callback
 * GET /api/auth/github/callback
 */
async function githubCallback(req, res) {
  console.log('[GitHub Callback] Started');
  console.log('[GitHub Callback] Query params:', req.query);
  console.log('[GitHub Callback] Headers:', req.headers);
  
  try {
    const { code, error: githubError } = req.query;

    // Check for GitHub error
    if (githubError) {
      console.error('[GitHub Callback] GitHub returned error:', githubError);
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${githubError}`);
    }

    if (!code) {
      console.error('[GitHub Callback] No code provided');
      return res.status(400).json({
        success: false,
        message: 'Authorization code missing'
      });
    }

    console.log('[GitHub Callback] Code received, exchanging for token...');

    // Exchange code for access token
    const accessToken = await GitHubService.getAccessToken(code);
    console.log('[GitHub Callback] Access token obtained');

    // Fetch GitHub user profile
    const githubUser = await GitHubService.getUserProfile(accessToken);
    console.log('[GitHub Callback] GitHub user:', githubUser.username);

    // Check if user already exists in our database
    let user = await UserModel.findByGithubId(githubUser.github_id);
    console.log('[GitHub Callback] Existing user found?', !!user);

    if (!user) {
      // Check if email is already used by an email-registered user
      const existingEmailUser = await UserModel.findByEmail(githubUser.email);
      
      if (existingEmailUser && existingEmailUser.auth_provider === 'email') {
        console.log('[GitHub Callback] Email conflict with password account');
        return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=Email already registered with password. Please login with email.`);
      }

      // Create new GitHub user
      console.log('[GitHub Callback] Creating new GitHub user');
      user = await UserModel.createFromGithub({
        ...githubUser,
        access_token: accessToken
      });
    } else {
      // Update existing GitHub user's token
      console.log('[GitHub Callback] Updating existing GitHub user');
      await UserModel.updateGithubToken(githubUser.github_id, accessToken);
      await UserModel.updateLastLogin(user.id);
    }

    // Generate JWT token
    const token = generateToken(user);
    console.log('[GitHub Callback] JWT token generated' , token);

    // Log the redirect URL
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}`;
    console.log('[GitHub Callback] Redirecting to:', redirectUrl);
    
    // Redirect to frontend with token
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('[GitHub Callback] ERROR:', error);
    console.error('[GitHub Callback] Error stack:', error.stack);
    
    const errorMessage = encodeURIComponent(error.message || 'GitHub authentication failed');
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${errorMessage}`);
  }
}

/**
 * Logout user (frontend will discard token)
 * POST /api/auth/logout
 */
async function logout(req, res) {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}

module.exports = {
  register,
  login,
  getMe,
  githubLogin,
  githubCallback,
  logout
};