// Purpose: Initialize Supabase client with your credentials.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Validate required environment variables
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required in .env file');
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY is required in .env file');
}

// Create Supabase client (for frontend-like operations with RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Create admin client with service role (bypasses RLS - use only in backend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = {
  supabase,      // For operations that should respect RLS
  supabaseAdmin  // For admin operations (bypass RLS)
};