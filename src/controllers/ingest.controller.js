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
        const existingRepo = await RepositoryModel.findByRepoName(repo_name, user.id);
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
                user_id: user.id,
                status: 'pending',
                is_private: isPrivate,
                default_branch: defaultBranch,
                language: language,  // ← Now saves the language
                stars: stars
            });
        } else {
            // Update status to pending for re-indexing
            await RepositoryModel.updateStatus(repo_name, user.id, 'pending');
        }

        // Call Python agent to start ingestion
        const githubToken = fullUser.github_access_token;
        const ingestionResponse = await PythonAgentService.startIngestion(
            repo_url,
            repo_name,
            githubToken
        );

        // Update status to indexing
        await RepositoryModel.updateStatus(repo_name, user.id, 'indexing');


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

        // Get from local database
        const repo = await RepositoryModel.findByRepoName(repoName, user.id);
        if (!repo) {
            return res.status(404).json({
                success: false,
                message: 'Repository not found'
            });
        }

        // If still indexing, fetch REAL-TIME status from Python agent
        let pythonStatus = null;
        let realTimeProgress = null;

        if (repo.status === 'indexing') {
            try {
                // Call Python's status endpoint
                pythonStatus = await PythonAgentService.getIngestionStatus(repoName);

                // ← ADD THIS CONSOLE LOG
                console.log(`📊 [${repoName}] Real-time progress:`, {
                    status: pythonStatus.status,
                    step: pythonStatus.step,
                    percent: pythonStatus.percent_complete,
                    elapsed: pythonStatus.elapsed_seconds,
                    eta: pythonStatus.eta_seconds,
                    chunks: `${pythonStatus.chunks_processed || 0}/${pythonStatus.chunks_total || 0}`
                });

                if (pythonStatus && pythonStatus.status !== 'unknown') {
                    // Build real-time progress object from Python data
                    realTimeProgress = {
                        status: pythonStatus.status,
                        step: pythonStatus.step || 'processing',
                        percent_complete: pythonStatus.percent_complete || 0,
                        elapsed_seconds: pythonStatus.elapsed_seconds || 0,
                        eta_seconds: pythonStatus.eta_seconds || 0,
                        chunks_processed: pythonStatus.chunks_processed || 0,
                        chunks_total: pythonStatus.chunks_total || 0,
                        files_processed: pythonStatus.files_processed || 0,
                        commits_processed: pythonStatus.commits_processed || 0
                    };

                    // Sync to database if completed
                    if (pythonStatus.status === 'completed' || pythonStatus.status === 'complete') {
                        await RepositoryModel.updateStatus(repoName, user.id, 'completed', {
                            chunks_count: pythonStatus.chunks_stored || 0,
                            files_count: pythonStatus.files_processed || 0,
                            commits_count: pythonStatus.commits_processed || 0
                        });
                        repo.status = 'completed';
                        repo.chunks_count = pythonStatus.chunks_stored || 0;
                    } else if (pythonStatus.status === 'error') {
                        await RepositoryModel.updateStatus(repoName, user.id, 'failed', {
                            error_message: pythonStatus.error || 'Unknown error'
                        });
                        repo.status = 'failed';
                    }
                }
            } catch (error) {
                console.error('Failed to fetch Python status:', error.message);
                // Don't fail - just return DB status
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
                // Include real-time progress if available
                progress: realTimeProgress
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


module.exports = {
    startIngestion,
    getIngestionStatus
};