// src/controllers/dashboard.controller.js

const UserModel = require('../models/user.model');
const RepositoryModel = require('../models/repository.model');
const ConversationModel = require('../models/conversation.model');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Get dashboard statistics for authenticated user
 * GET /api/dashboard/stats
 */
async function getDashboardStats(req, res) {
    try {
        const userId = req.userId;

        // Get user details
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const fullUser = await UserModel.findByEmail(user.email);
        const userGithubId = fullUser.github_id;

        // ========== 1. REPOSITORY STATS ==========
        // Get standard repos
        const { data: standardRepos, error: reposError } = await supabaseAdmin
            .from('repositories')
            .select('repo_name, status, language, chunks_count, files_count, commits_count, created_at')
            .eq('owner_github_id', userGithubId);

        if (reposError) throw reposError;

        // Get branch indices (Deep Indexing)
        const { data: branchRepos, error: branchError } = await supabaseAdmin
            .from('branch_indexes')
            .select('repo_name, status, language, chunks_count, files_count, commits_count, created_at')
            .eq('user_github_id', userGithubId);

        if (branchError) throw branchError;

        // Merge repositories, favoring branch indices for stats if they exist
        const mergedReposMap = new Map();
        
        standardRepos.forEach(r => {
            mergedReposMap.set(r.repo_name, r);
        });
        
        branchRepos.forEach(r => {
            // If it exists in both, merge stats
            if (mergedReposMap.has(r.repo_name)) {
                const existing = mergedReposMap.get(r.repo_name);
                mergedReposMap.set(r.repo_name, {
                    ...existing,
                    chunks_count: Math.max(existing.chunks_count || 0, r.chunks_count || 0),
                    files_count: Math.max(existing.files_count || 0, r.files_count || 0),
                    commits_count: Math.max(existing.commits_count || 0, r.commits_count || 0),
                    status: r.status === 'completed' ? 'completed' : existing.status
                });
            } else {
                mergedReposMap.set(r.repo_name, r);
            }
        });

        const repos = Array.from(mergedReposMap.values());

        const repoStats = {
            total: repos.length,
            completed: repos.filter(r => r.status === 'completed').length,
            indexing: repos.filter(r => r.status === 'indexing').length,
            failed: repos.filter(r => r.status === 'failed').length,
            pending: repos.filter(r => r.status === 'pending').length,
            total_chunks: repos.reduce((sum, r) => sum + (r.chunks_count || 0), 0),
            total_files: repos.reduce((sum, r) => sum + (r.files_count || 0), 0),
            total_commits: repos.reduce((sum, r) => sum + (r.commits_count || 0), 0),
            languages: getLanguageBreakdown(repos)
        };

        // ========== 2. QUERY STATS ==========
        const { data: messages, error: messagesError } = await supabaseAdmin
            .from('conversation_messages')
            .select(`
                role,
                created_at,
                tokens_used,
                model_used,
                conversation_id,
                conversations!inner (repo_name, user_github_id)
            `)
            .eq('conversations.user_github_id', userGithubId)
            .eq('role', 'assistant');

        if (messagesError) throw messagesError;

        // Get user questions (for question count)
        const { data: userQuestions, error: questionsError } = await supabaseAdmin
            .from('conversation_messages')
            .select('created_at, conversation_id, conversations!inner (repo_name, user_github_id)')
            .eq('conversations.user_github_id', userGithubId)
            .eq('role', 'user');

        if (questionsError) throw questionsError;

        const now = new Date();
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));

        const queryStats = {
            total_questions: userQuestions?.length || 0,
            total_answers: messages?.length || 0,
            avg_tokens_per_answer: messages?.length ? 
                Math.round(messages.reduce((sum, m) => sum + (m.tokens_used || 0), 0) / messages.length) : 0,
            questions_last_7_days: userQuestions?.filter(q => new Date(q.created_at) >= sevenDaysAgo).length || 0,
            questions_by_day: getQuestionsByDay(userQuestions),
            top_repos_by_queries: getTopReposByQueries(userQuestions),
            models_used: getModelBreakdown(messages)
        };

        // ========== 3. CONVERSATION STATS ==========
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('id, repo_name, created_at, updated_at, conversation_messages(id)')
            .eq('user_github_id', userGithubId);

        if (convError) throw convError;

        const conversationStats = {
            total_conversations: conversations?.length || 0,
            avg_messages_per_conversation: messages?.length ? 
                Math.round(messages.length / (conversations?.length || 1)) : 0,
            most_discussed_repos: getMostDiscussedRepos(conversations),
            conversations_last_30_days: getConversationsByMonth(conversations)
        };

        // ========== 4. DOCUMENTATION STATS ==========
        const { data: docs, error: docsError } = await supabaseAdmin
            .from('documentation')
            .select('doc_type, created_at, repo_name')
            .eq('user_github_id', userGithubId);

        if (docsError) throw docsError;

        const docStats = {
            total_docs: docs?.length || 0,
            by_type: getDocTypeBreakdown(docs),
            last_generated: docs?.[0]?.created_at || null,
            repos_with_docs: [...new Set(docs?.map(d => d.repo_name) || [])].length
        };

        // ========== 5. RECENT ACTIVITY ==========
        const recentQueries = await getRecentQueries(userGithubId);
        const recentDocs = docs?.slice(0, 3).map(d => ({
            repo_name: d.repo_name,
            doc_type: d.doc_type,
            generated_at: d.created_at
        })) || [];

        const currentlyIndexing = repos
            .filter(r => r.status === 'indexing')
            .map(r => ({ repo_name: r.repo_name, status: r.status }));

        // ========== 6. PERFORMANCE METRICS ==========
        const performanceStats = {
            avg_response_time_ms: await getAvgResponseTime(userGithubId),
            success_rate: calculateSuccessRate(messages),
            total_tokens_used: messages?.reduce((sum, m) => sum + (m.tokens_used || 0), 0) || 0
        };

        // ========== 7. RECENTLY INDEXED REPOS ==========
        const recentlyIndexed = repos
            .filter(r => r.status === 'completed')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
            .map(r => ({
                repo_name: r.repo_name,
                language: r.language,
                chunks: r.chunks_count,
                indexed_at: r.created_at
            }));

        res.json({
            success: true,
            data: {
                repositories_indexed: repoStats.completed,
                total_queries: queryStats.total_questions,
                avg_accuracy_score: 85, // Default for now
                total_chunks: repoStats.total_chunks,
                repository_stats: repoStats,
                query_stats: queryStats,
                conversation_stats: conversationStats,
                documentation_stats: docStats,
                recent_activity: {
                    recent_queries: recentQueries,
                    recent_docs: recentDocs,
                    currently_indexing: currentlyIndexing,
                    recently_indexed: recentlyIndexed
                },
                performance_stats: performanceStats
            }
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get dashboard statistics'
        });
    }
}

// ========== HELPER FUNCTIONS ==========

function getLanguageBreakdown(repos) {
    const langMap = new Map();
    repos.forEach(repo => {
        if (repo.language) {
            langMap.set(repo.language, (langMap.get(repo.language) || 0) + 1);
        }
    });
    return Array.from(langMap.entries()).map(([name, count]) => ({ name, count }));
}

function getQuestionsByDay(questions) {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const count = questions?.filter(q => q.created_at.startsWith(dateStr)).length || 0;
        last7Days.push({ date: dateStr, count });
    }
    return last7Days;
}

function getTopReposByQueries(questions) {
    const repoMap = new Map();
    questions?.forEach(q => {
        const repoName = q.conversations?.repo_name || 'unknown';
        repoMap.set(repoName, (repoMap.get(repoName) || 0) + 1);
    });
    return Array.from(repoMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

function getModelBreakdown(messages) {
    const modelMap = new Map();
    messages?.forEach(m => {
        if (m.model_used) {
            modelMap.set(m.model_used, (modelMap.get(m.model_used) || 0) + 1);
        }
    });
    return Array.from(modelMap.entries()).map(([name, count]) => ({ name, count }));
}

function getMostDiscussedRepos(conversations) {
    const repoMap = new Map();
    conversations?.forEach(c => {
        if (c.repo_name) {
            const messageCount = c.conversation_messages?.length || 0;
            repoMap.set(c.repo_name, (repoMap.get(c.repo_name) || 0) + messageCount);
        }
    });
    return Array.from(repoMap.entries())
        .map(([name, message_count]) => ({ name, message_count }))
        .sort((a, b) => b.message_count - a.message_count)
        .slice(0, 5);
}

function getConversationsByMonth(conversations) {
    const monthMap = new Map();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const count = conversations?.filter(c => c.created_at.startsWith(dateStr)).length || 0;
        monthMap.set(dateStr, (monthMap.get(dateStr) || 0) + count);
    }
    return Array.from(monthMap.entries()).map(([date, count]) => ({ date, count }));
}

function getDocTypeBreakdown(docs) {
    const typeMap = new Map();
    docs?.forEach(d => {
        typeMap.set(d.doc_type, (typeMap.get(d.doc_type) || 0) + 1);
    });
    return Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));
}

async function getRecentQueries(userGithubId) {
    const { data, error } = await supabaseAdmin
        .from('conversation_messages')
        .select(`
            content,
            created_at,
            conversations!inner (repo_name)
        `)
        .eq('conversations.user_github_id', userGithubId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) return [];
    return data.map(q => ({
        question: q.content?.substring(0, 100) + (q.content?.length > 100 ? '...' : ''),
        repo_name: q.conversations?.repo_name,
        asked_at: q.created_at
    }));
}

async function getAvgResponseTime(userGithubId) {
    // Get timestamps of user message and assistant response
    const { data, error } = await supabaseAdmin
        .from('conversation_messages')
        .select('created_at, conversation_id, role')
        .eq('conversations.user_github_id', userGithubId)
        .order('created_at', { ascending: true });

    if (error || !data) return null;

    let totalTime = 0;
    let pairs = 0;

    for (let i = 0; i < data.length - 1; i++) {
        if (data[i].role === 'user' && data[i + 1].role === 'assistant' && 
            data[i].conversation_id === data[i + 1].conversation_id) {
            const userTime = new Date(data[i].created_at).getTime();
            const assistantTime = new Date(data[i + 1].created_at).getTime();
            totalTime += (assistantTime - userTime);
            pairs++;
        }
    }

    return pairs > 0 ? Math.round(totalTime / pairs) : null;
}

function calculateSuccessRate(messages) {
    // Simple: if answer has content and more than 50 chars, consider success
    const successful = messages?.filter(m => m.content && m.content.length > 50).length || 0;
    const total = messages?.length || 0;
    return total > 0 ? Math.round((successful / total) * 100) : 0;
}

module.exports = {
    getDashboardStats
};