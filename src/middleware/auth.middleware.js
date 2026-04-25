// Purpose: Protect routes by verifying JWT tokens.

const { verifyToken } = require('../utils/jwt');
const UserModel = require('../models/user.model');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 */
async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database to ensure they still exist
    const user = await UserModel.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }
    
    // Attach user to request object
    req.user = user;
    req.userId = decoded.id;
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token.'
    });
  }
}

module.exports = {
  authMiddleware
};