const PythonAgentService = require('../services/pythonAgent.service');
const UserModel = require('../models/user.model');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Generate documentation for a repository
 * POST /api/docs/generate
 * Body: { repo_name, doc_type? }
 */
async function generateDocumentation(req, res) {
    try {
        const { repo_name, doc_type = 'full' } = req.body;
        const userId = req.userId;

        if (!repo_name) {
            return res.status(400).json({
                success: false,
                message: 'repo_name is required'
            });
        }

        // Get user details
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const fullUser = await UserModel.findByEmail(user.email);

        // Define prompts based on doc_type
        const prompts = {
            overview: `Generate a comprehensive project overview documentation for the repository "${repo_name}". Include: project purpose, main features, technology stack, architecture overview, and key dependencies. Format as structured Markdown with proper headings.`,

            setup: `Create a detailed setup and installation guide for the repository "${repo_name}". Include: prerequisites, environment setup, configuration steps, build commands, and run instructions. Format as step-by-step Markdown with code blocks.`,

            api: `Document the main code structure and API of the repository "${repo_name}". Include: key modules and their purposes, important functions/classes, data flow diagrams in text, and entry points. Use Markdown with code blocks for examples.`,

            full: `Generate complete project documentation for the repository "${repo_name}" with the following sections:
1. Project Overview (purpose, goals, target audience)
2. Architecture & Tech Stack (system design, technologies used)
3. Setup & Installation (prerequisites, steps, configuration)
4. Key Features (main functionality with examples)
5. Code Structure (folder organization, important files)
6. Usage Examples (common use cases with code)
7. Contributing Guidelines (how to contribute)

Format as professional Markdown with proper headings (#, ##, ###), lists, code blocks using triple backticks, and clear section separation. Make it ready for PDF export.`
        };

        const selectedPrompt = prompts[doc_type] || prompts.full;

        console.log(`📝 Generating ${doc_type} documentation for ${repo_name}...`);

        // Call Python's /api/query endpoint
        const response = await PythonAgentService.queryRepo(
            repo_name,
            selectedPrompt,
            null
        );

        // UPSERT: Check if documentation already exists
        const { data: existingDoc } = await supabaseAdmin
            .from('documentation')
            .select('id')
            .eq('repo_name', repo_name)
            .eq('doc_type', doc_type)
            .eq('user_github_id', fullUser.github_id)
            .maybeSingle();

        let result;
        if (existingDoc) {
            // Update existing documentation
            const { data, error } = await supabaseAdmin
                .from('documentation')
                .update({
                    content: response.answer,
                    sources: response.sources || [],
                    model_used: response.model,
                    tokens_used: response.tokens_used,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingDoc.id)
                .select()
                .single();

            if (error) throw error;
            result = data;
            console.log(`📝 Updated existing ${doc_type} documentation for ${repo_name}`);
        } else {
            // Insert new documentation
            const { data, error } = await supabaseAdmin
                .from('documentation')
                .insert([{
                    user_github_id: fullUser.github_id,
                    repo_name: repo_name,
                    doc_type: doc_type,
                    content: response.answer,
                    sources: response.sources || [],
                    model_used: response.model,
                    tokens_used: response.tokens_used
                }])
                .select()
                .single();

            if (error) throw error;
            result = data;
            console.log(`📝 Created new ${doc_type} documentation for ${repo_name}`);
        }

        res.json({
            success: true,
            data: {
                id: result.id,
                markdown: result.content,
                repo_name: repo_name,
                doc_type: doc_type,
                sources: result.sources,
                model: result.model_used,
                tokens_used: result.tokens_used,
                created_at: result.created_at,
                updated_at: result.updated_at,
                is_new: !existingDoc
            }
        });

    } catch (error) {
        console.error('Documentation generation error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate documentation'
        });
    }
}

/**
 * Get all documentation for the authenticated user
 * GET /api/docs
 */
async function getUserDocs(req, res) {
    try {
        const userId = req.userId;
        
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const fullUser = await UserModel.findByEmail(user.email);
        
        const { data: docs, error } = await supabaseAdmin
            .from('documentation')
            .select('*')
            .eq('user_github_id', fullUser.github_id)
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({
            success: true,
            data: {
                documentation: docs,
                total: docs.length
            }
        });
        
    } catch (error) {
        console.error('Get user docs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get documentation'
        });
    }
}

/**
 * Get specific documentation by ID
 * GET /api/docs/:id
 */
async function getDocumentationById(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;
        
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const fullUser = await UserModel.findByEmail(user.email);
        
        const { data: doc, error } = await supabaseAdmin
            .from('documentation')
            .select('*')
            .eq('id', id)
            .eq('user_github_id', fullUser.github_id)
            .single();
        
        if (error || !doc) {
            return res.status(404).json({
                success: false,
                message: 'Documentation not found'
            });
        }
        
        res.json({
            success: true,
            data: doc
        });
        
    } catch (error) {
        console.error('Get doc by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get documentation'
        });
    }
}

/**
 * Delete documentation
 * DELETE /api/docs/:id
 */
async function deleteDocumentation(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;
        
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const fullUser = await UserModel.findByEmail(user.email);
        
        const { error } = await supabaseAdmin
            .from('documentation')
            .delete()
            .eq('id', id)
            .eq('user_github_id', fullUser.github_id);
        
        if (error) throw error;
        
        res.json({
            success: true,
            message: 'Documentation deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete doc error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete documentation'
        });
    }
}

module.exports = {
    generateDocumentation,
    getUserDocs,
    getDocumentationById,
    deleteDocumentation
};