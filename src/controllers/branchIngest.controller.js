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
        const existing = await BranchIndexModel.findByRepoName(repo_name, user.id);
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
                user_id: user.id,
                repo_name: repo_name,
                repo_url: repo_url,
                full_name: fullName,
                branches_list: branchesList,
                language: language,
                stars: stars
            });
        } else {
            await BranchIndexModel.updateStatus(repo_name, user.id, 'pending');
        }

        // Call Python agent
        const githubToken = fullUser.github_access_token;
        const response = await PythonAgentService.startBranchIngestion(
            repo_url,
            repo_name,
            githubToken
        );

        // Update status
        await BranchIndexModel.updateStatus(repo_name, user.id, 'indexing');

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

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const branchIndex = await BranchIndexModel.findByRepoName(repoName, user.id);
        if (!branchIndex) {
            return res.status(404).json({
                success: false,
                message: 'Branch index not found'
            });
        }

        let realTimeProgress = null;

        if (branchIndex.status === 'indexing') {
            try {
                // Call Python's branch status endpoint
                const pythonStatus = await PythonAgentService.getBranchIngestionStatus(repoName);

                if (pythonStatus && pythonStatus.status !== 'unknown') {
                    realTimeProgress = {
                        status: pythonStatus.status,
                        step: pythonStatus.step || 'processing',
                        percent_complete: pythonStatus.percent_complete || 0,
                        elapsed_seconds: pythonStatus.elapsed_seconds || 0,
                        eta_seconds: pythonStatus.eta_seconds || 0,
                        branches_processed: pythonStatus.branches_processed || 0,
                        branches_total: pythonStatus.branches_total || 0
                    };

                    if (pythonStatus.status === 'completed' || pythonStatus.status === 'complete') {
                        await BranchIndexModel.updateStatus(repoName, user.id, 'completed', {
                            chunks_count: pythonStatus.chunks_stored || 0,
                            files_count: pythonStatus.files_processed || 0,
                            commits_count: pythonStatus.commits_processed || 0,
                            branches_count: pythonStatus.branches_indexed?.length || 0,
                            branches_list: pythonStatus.branches_indexed || []
                        });
                        branchIndex.status = 'completed';
                    } else if (pythonStatus.status === 'error') {
                        await BranchIndexModel.updateStatus(repoName, user.id, 'failed', {
                            error_message: pythonStatus.error || 'Unknown error'
                        });
                        branchIndex.status = 'failed';
                    }
                }
            } catch (error) {
                console.error('Failed to fetch Python branch status:', error.message);
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
                error_message: branchIndex.error_message,
                progress: realTimeProgress
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


module.exports = {
    startBranchIngestion,
    getBranchIngestionStatus
};