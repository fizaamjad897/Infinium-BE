// Purpose: Hash and compare passwords using bcrypt.

const bcrypt = require('bcryptjs');

/**
 * Hash a plain text password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare plain text password with hashed password
 * @param {string} plainPassword - Plain text password from user
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} - True if match, false otherwise
 */
async function comparePassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  hashPassword,
  comparePassword
};