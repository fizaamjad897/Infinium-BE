const PythonAgentService = require('../services/pythonAgent.service');
const RepositoryModel = require('../models/repository.model');
const UserModel = require('../models/user.model');

/**
 * Start ingesting a GitHub repository
 * POST /api/ingest
 * Body: { repo_url, repo_name }
 */
async function startIngestion(req, res) {
    try {
        const { repo_url, repo_name } = req.body;
        const userId = req.userId;

        // Validation
        if (!repo_url || !repo_name) {
            return res.status(400).json({
                success: false,
                message: 'repo_url and repo_name are required'
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

        // Check if repo already indexed
        const existingRepo = await RepositoryModel.findByRepoName(repo_name, fullUser.github_id);
        if (existingRepo && existingRepo.status === 'completed') {
            return res.status(409).json({
                success: false,
                message: 'Repository already indexed',
                data: existingRepo
            });
        }

        // Check if Python agent is running
        const isHealthy = await PythonAgentService.healthCheck();
        if (!isHealthy) {
            return res.status(503).json({
                success: false,
                message: 'Python AI Agent is not running. Please start it on port 8000'
            });
        }

        // Create or update repository record
        let repo = existingRepo;
        if (!existingRepo) {
            // Extract repo details from URL
            const fullName = repo_url.replace('https://github.com/', '').replace('.git', '');
            const [owner, name] = fullName.split('/');

            // Fetch repo details from GitHub to get language
            let language = null;
            let isPrivate = false;
            let defaultBranch = 'main';
            let stars = 0;

            if (fullUser.github_access_token) {
                try {
                    const GitHubService = require('../services/github.service');
                    const repoDetails = await GitHubService.getRepo(
                        fullUser.github_access_token,
                        owner,
                        name
                    );
                    language = repoDetails.language;
                    isPrivate = repoDetails.private;
                    defaultBranch = repoDetails.default_branch;
                    stars = repoDetails.stars;
                    console.log(`📝 Repo language: ${language || 'unknown'}`);
                } catch (error) {
                    console.error('Failed to fetch repo details:', error.message);
                }
            }

            repo = await RepositoryModel.create({
                repo_name: repo_name,
                repo_url: repo_url,
                full_name: fullName,
                owner_github_id: fullUser.github_id,
                status: 'pending',
                is_private: isPrivate,
                default_branch: defaultBranch,
                language: language,  // ← Now saves the language
                stars: stars
            });
        } else {
            // Update status to pending for re-indexing
            await RepositoryModel.updateStatus(repo_name, fullUser.github_id, 'pending');
        }

        // Call Python agent to start ingestion
        const githubToken = fullUser.github_access_token;
        const ingestionResponse = await PythonAgentService.startIngestion(
            repo_url,
            repo_name,
            githubToken
        );

        // Update status to indexing
        await RepositoryModel.updateStatus(repo_name, fullUser.github_id, 'indexing');

        // Start background polling to sync status
        startStatusPolling(repo_name, fullUser.github_id);

        res.json({
            success: true,
            message: ingestionResponse.message || 'Ingestion started',
            data: {
                repo_name: repo_name,
                status: 'indexing',
                polling_endpoint: `/api/repos/${repo_name}/status`
            }
        });

    } catch (error) {
        console.error('Start ingestion error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start ingestion'
        });
    }
}

/**
 * Get ingestion status
 * GET /api/ingest/:repoName/status
 */
async function getIngestionStatus(req, res) {
    try {
        const { repoName } = req.params;
        const userId = req.userId;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const fullUser = await UserModel.findByEmail(user.email);

        // Get from local database
        const repo = await RepositoryModel.findByRepoName(repoName, fullUser.github_id);
        if (!repo) {
            return res.status(404).json({
                success: false,
                message: 'Repository not found'
            });
        }

        // If still indexing, check with Python agent for real-time status
        let pythonStatus = null;
        if (repo.status === 'indexing') {
            pythonStatus = await PythonAgentService.getIngestionStatus(repoName);

            // Sync status if Python shows completed
            if (pythonStatus.status === 'complete') {
                await RepositoryModel.updateStatus(repoName, fullUser.github_id, 'completed', {
                    chunks_count: pythonStatus.chunks_stored || 0,
                    files_count: pythonStatus.files_processed || 0,
                    commits_count: pythonStatus.commits_processed || 0
                });

                repo.status = 'completed';
                repo.chunks_count = pythonStatus.chunks_stored || 0;
                repo.files_count = pythonStatus.files_processed || 0;
                repo.commits_count = pythonStatus.commits_processed || 0;
            } else if (pythonStatus.status === 'error') {
                await RepositoryModel.updateStatus(repoName, fullUser.github_id, 'failed', {
                    error_message: pythonStatus.error || 'Unknown error'
                });
                repo.status = 'failed';
            }
        }

        res.json({
            success: true,
            data: {
                repo_name: repo.repo_name,
                status: repo.status,
                chunks_count: repo.chunks_count,
                files_count: repo.files_count,
                commits_count: repo.commits_count,
                indexed_at: repo.indexed_at,
                error_message: repo.error_message,
                python_status: pythonStatus // For debugging
            }
        });

    } catch (error) {
        console.error('Get ingestion status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get ingestion status'
        });
    }
}

/**
 * Background polling to sync status
 */
async function startStatusPolling(repoName, ownerGithubId) {
    const maxAttempts = 240; // 20 minutes (poll every 5 seconds)
    let attempts = 0;

    const pollInterval = setInterval(async () => {
        attempts++;

        try {
            const pythonStatus = await PythonAgentService.getIngestionStatus(repoName);

            if (pythonStatus.status === 'complete') {
                await RepositoryModel.updateStatus(repoName, ownerGithubId, 'completed', {
                    chunks_count: pythonStatus.chunks_stored || 0,
                    files_count: pythonStatus.files_processed || 0,
                    commits_count: pythonStatus.commits_processed || 0
                });
                clearInterval(pollInterval);
                console.log(`✅ Ingestion completed for ${repoName}`);
            } else if (pythonStatus.status === 'error') {
                await RepositoryModel.updateStatus(repoName, ownerGithubId, 'failed', {
                    error_message: pythonStatus.error || 'Unknown error'
                });
                clearInterval(pollInterval);
                console.log(`❌ Ingestion failed for ${repoName}`);
            } else if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                console.log(`⏰ Ingestion timeout for ${repoName}`);
            }
        } catch (error) {
            console.error(`Polling error for ${repoName}:`, error.message);
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
            }
        }
    }, 5000); // Poll every 5 seconds
}

module.exports = {
    startIngestion,
    getIngestionStatus
};