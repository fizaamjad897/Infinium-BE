const PythonAgentService = require('../services/pythonAgent.service');
const BranchIndexModel = require('../models/branchIndex.model');
const UserModel = require('../models/user.model');

/**
 * Start ingesting all branches of a repository
 * POST /api/branch-ingest
 * Body: { repo_url, repo_name }
 */
async function startBranchIngestion(req, res) {
    try {
        const { repo_url, repo_name } = req.body;
        const userId = req.userId;

        if (!repo_url || !repo_name) {
            return res.status(400).json({
                success: false,
                message: 'repo_url and repo_name are required'
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const fullUser = await UserModel.findByEmail(user.email);

        // Check if already indexing
        const existing = await BranchIndexModel.findByRepoName(repo_name, fullUser.github_id);
        if (existing && existing.status === 'completed') {
            return res.status(409).json({
                success: false,
                message: 'Branches already indexed for this repository',
                data: existing
            });
        }

        // Extract repo details
        const fullName = repo_url.replace('https://github.com/', '').replace('.git', '');
        const [owner, name] = fullName.split('/');

        let language = null;
        let stars = 0;
        let branchesList = [];

        if (fullUser.github_access_token) {
            try {
                const GitHubService = require('../services/github.service');
                const repoDetails = await GitHubService.getRepo(
                    fullUser.github_access_token,
                    owner,
                    name
                );
                language = repoDetails.language;
                stars = repoDetails.stars;
                branchesList = repoDetails.branches || [];
                console.log(`🌿 Found ${branchesList.length} branches`);
            } catch (error) {
                console.error('Failed to fetch repo details:', error.message);
            }
        }

        // Create branch index record
        let branchIndex = existing;
        if (!existing) {
            branchIndex = await BranchIndexModel.create({
                user_github_id: fullUser.github_id,
                repo_name: repo_name,
                repo_url: repo_url,
                full_name: fullName,
                branches_list: branchesList,
                language: language,
                stars: stars
            });
        } else {
            await BranchIndexModel.updateStatus(repo_name, fullUser.github_id, 'pending');
        }

        // Call Python agent
        const githubToken = fullUser.github_access_token;
        const response = await PythonAgentService.startBranchIngestion(
            repo_url,
            repo_name,
            githubToken
        );

        // Update status
        await BranchIndexModel.updateStatus(repo_name, fullUser.github_id, 'indexing');

        // Start polling
        startBranchPolling(repo_name, fullUser.github_id);

        res.json({
            success: true,
            message: response.message || 'Branch ingestion started',
            data: {
                repo_name: repo_name,
                status: 'indexing',
                branches_count: branchesList.length
            }
        });

    } catch (error) {
        console.error('Start branch ingestion error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start branch ingestion'
        });
    }
}

/**
 * Get branch ingestion status
 * GET /api/branch-ingest/:repoName/status
 */
async function getBranchIngestionStatus(req, res) {
    try {
        const { repoName } = req.params;
        const userId = req.userId;

        const fullUser = await UserModel.findById(userId);
        if (!fullUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        const branchIndex = await BranchIndexModel.findByRepoName(repoName, fullUser.github_id);

        if (!branchIndex) {
            return res.status(404).json({
                success: false,
                message: 'Branch index not found'
            });
        }

        let pythonStatus = null;
        if (branchIndex.status === 'indexing') {
            pythonStatus = await PythonAgentService.getBranchIngestionStatus(repoName);
            
            if (pythonStatus.status === 'completed' || pythonStatus.status === 'complete') {
                await BranchIndexModel.updateStatus(repoName, fullUser.github_id, 'completed', {
                    chunks_count: pythonStatus.chunks_stored || 0,
                    files_count: pythonStatus.files_processed || 0,
                    commits_count: pythonStatus.commits_processed || 0,
                    branches_count: pythonStatus.branches_indexed?.length || 0,
                    branches_list: pythonStatus.branches_indexed || []
                });
                branchIndex.status = 'completed';
            } else if (pythonStatus.status === 'error') {
                await BranchIndexModel.updateStatus(repoName, fullUser.github_id, 'failed', {
                    error_message: pythonStatus.error || 'Unknown error'
                });
                branchIndex.status = 'failed';
            }
        }

        res.json({
            success: true,
            data: {
                repo_name: branchIndex.repo_name,
                status: branchIndex.status,
                branches_count: branchIndex.branches_count,
                branches_list: branchIndex.branches_list,
                chunks_count: branchIndex.chunks_count,
                files_count: branchIndex.files_count,
                commits_count: branchIndex.commits_count,
                indexed_at: branchIndex.indexed_at,
                error_message: branchIndex.error_message
            }
        });

    } catch (error) {
        console.error('Get branch ingestion status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get branch ingestion status'
        });
    }
}

/**
 * Background polling for branch ingestion
 */
async function startBranchPolling(repoName, userGithubId) {
    let attempts = 0;
    const maxAttempts = 240;
    
    const pollInterval = setInterval(async () => {
        attempts++;
        
        try {
            const pythonStatus = await PythonAgentService.getBranchIngestionStatus(repoName);
            
            if (pythonStatus.status === 'completed' || pythonStatus.status === 'complete') {
                await BranchIndexModel.updateStatus(repoName, userGithubId, 'completed', {
                    chunks_count: pythonStatus.chunks_stored || 0,
                    files_count: pythonStatus.files_processed || 0,
                    commits_count: pythonStatus.commits_processed || 0,
                    branches_count: pythonStatus.branches_indexed?.length || 0,
                    branches_list: pythonStatus.branches_indexed || []
                });
                clearInterval(pollInterval);
                console.log(`✅ Branch ingestion completed for ${repoName}`);
            } else if (pythonStatus.status === 'error') {
                await BranchIndexModel.updateStatus(repoName, userGithubId, 'failed', {
                    error_message: pythonStatus.error || 'Unknown error'
                });
                clearInterval(pollInterval);
                console.log(`❌ Branch ingestion failed for ${repoName}`);
            } else if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                console.log(`⏰ Branch ingestion timeout for ${repoName}`);
            }
        } catch (error) {
            console.error(`Polling error for ${repoName}:`, error.message);
            if (attempts >= maxAttempts) clearInterval(pollInterval);
        }
    }, 5000);
}

module.exports = {
    startBranchIngestion,
    getBranchIngestionStatus
};