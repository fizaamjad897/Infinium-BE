// Purpose: Generate and verify JWT tokens for authentication.

const jwt = require('jsonwebtoken');

/**
 * Generate JWT token for a user
 * @param {Object} user - User object from database
 * @returns {string} - JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    authProvider: user.auth_provider
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token from Authorization header
 * @returns {Object} - Decoded payload
 * @throws {Error} - If token is invalid or expired
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired. Please login again.');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token. Please login again.');
    }
    throw error;
  }
}

module.exports = {
  generateToken,
  verifyToken
};