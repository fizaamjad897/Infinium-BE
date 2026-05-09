const axios = require('axios');

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';

class PythonAgentService {

    /**
     * Start ingestion of a GitHub repository
     * @param {string} repoUrl - GitHub clone URL
     * @param {string} repoName - Repository name (e.g., "owner_repo")
     * @param {string} githubToken - GitHub access token (for private repos)
     * @returns {Promise<Object>} - Ingestion response
     */
    static async startIngestion(repoUrl, repoName, githubToken = null) {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (githubToken) {
                headers['X-GitHub-Token'] = githubToken;
            }

            const requestBody = {
                repo_url: repoUrl,
                repo_name: repoName
            };

            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/ingest/repo`, //for both public and private repo ingestion (universal endpoint)
                requestBody,
                {
                    headers: headers,
                    timeout: 5000
                }
            );

            return response.data;
        } catch (error) {
            console.error('Python agent ingestion error:', error.message);
            throw new Error(`Failed to start ingestion: ${error.response?.data?.detail || error.message}`);
        }
    }

    /**
     * Get ingestion status from Python agent
     * @param {string} repoName - Repository name
     * @returns {Promise<Object>} - Status object
     */
    /**
     * Delete a repository from the Python agent (wipes ChromaDB collection
     * and removes ingestion status entry).
     * @param {string} repoName - Repository name
     * @param {string} githubToken - GitHub access token (for auth bypass header)
     * @returns {Promise<Object>}
     */
    static async deleteRepo(repoName, githubToken = null) {
        try {
            const headers = {};
            if (githubToken) headers['X-GitHub-Token'] = githubToken;

            const response = await axios.delete(
                `${PYTHON_AGENT_URL}/api/repos/${encodeURIComponent(repoName)}`,
                { headers, timeout: 15000 }
            );
            return response.data;
        } catch (error) {
            // 404 means it was already gone — treat as success.
            if (error.response?.status === 404) {
                return { status: 'not_found', repo_name: repoName };
            }
            console.error('Python agent delete error:', error.message);
            throw new Error(`Failed to delete repo from Python agent: ${error.response?.data?.detail || error.message}`);
        }
    }

    static async getIngestionStatus(repoName) {
        try {
            const response = await axios.get(
                `${PYTHON_AGENT_URL}/api/repos/${repoName}/status`,
                { timeout: 10000 }
            );

            return response.data;
        } catch (error) {
            // Transient socket resets / timeouts during heavy ingestion are
            // expected — the poller retries on the next tick. Don't spam logs.
            const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'];
            if (!transient.includes(error.code)) {
                console.error('Get ingestion status error:', error.message);
            }
            return {
                status: 'unknown',
                error: error.message
            };
        }
    }

    /**
     * Check if Python agent is healthy
     * @returns {Promise<boolean>} - True if healthy
     */
    static async healthCheck() {
        try {
            const response = await axios.get(`${PYTHON_AGENT_URL}/api/health`, { timeout: 3000 });
            return response.status === 200;
        } catch (error) {
            console.error('Python agent health check failed:', error.message);
            return false;
        }
    }

    /**
     * Ask a question about a repo and get a streaming response
     */
    static async streamQueryRepo(repoName, query, conversationId = null, branchFilter = null) {
        try {
            const response = await axios.post(`${PYTHON_AGENT_URL}/api/query`, {
                repo_name: repoName,
                query: query,
                conversation_id: conversationId,
                branch_filter: branchFilter,
                stream: true
            }, {
                responseType: 'stream'
            });
            return response.data;
        } catch (error) {
            console.error('Python Agent streaming query error:', error.message);
            throw new Error(`Agent reasoning failed: ${error.message}`);
        }
    }

    /**
   * Ask a question about a specific repository
   * @param {string} repoName - Repository name
   * @param {string} query - User's question
   * @param {string} conversationId - Optional conversation ID for context
   * @returns {Promise<Object>} - Answer with sources
   */
    static async queryRepo(repoName, query, conversationId = null, branchFilter = null) {
        try {
            const requestBody = {
                query: query,
                repo_name: repoName,
                use_hybrid: true,
                top_k: 10,
                branch_filter: branchFilter
            };

            if (conversationId) {
                requestBody.conversation_id = conversationId;
            }

            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/query`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 180000  // 60 seconds for LLM generation
                }
            );

            return response.data;
        } catch (error) {
            console.error('Python agent query error:', error.message);
            throw new Error(`Failed to get answer: ${error.response?.data?.detail || error.message}`);
        }
    }

    /**
     * Start a new conversation in Python agent
     * @param {string} repoName - Repository name
     * @returns {Promise<string>} - Conversation ID
     */
    static async startConversation(repoName) {
        try {
            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/conversation/start`,
                { repo_name: repoName },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            return response.data.conversation_id;
        } catch (error) {
            console.error('Python agent start conversation error:', error.message);
            throw new Error(`Failed to start conversation: ${error.response?.data?.detail || error.message}`);
        }
    }

    /**
 * Start ingestion of all branches for a repository
 * @param {string} repoUrl - GitHub clone URL
 * @param {string} repoName - Repository name
 * @param {string} githubToken - GitHub access token
 * @returns {Promise<Object>} - Ingestion response
 */
    static async startBranchIngestion(repoUrl, repoName, githubToken = null) {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (githubToken) {
                headers['X-GitHub-Token'] = githubToken;
            }

            const requestBody = {
                repo_url: repoUrl,
                repo_name: repoName
            };

            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/ingest/branches`,
                requestBody,
                {
                    headers: headers,
                    timeout: 900000
                }
            );

            return response.data;
        } catch (error) {
            console.error('Python agent branch ingestion error:', error.message);
            throw new Error(`Failed to start branch ingestion: ${error.response?.data?.detail || error.message}`);
        }
    }

    /**
     * Get branch ingestion status from Python agent
     * @param {string} repoName - Repository name
     * @returns {Promise<Object>} - Status object
     */
    static async getBranchIngestionStatus(repoName) {
        try {
            const response = await axios.get(
                `${PYTHON_AGENT_URL}/api/repos/${repoName}/status?scope=branches`,
                { timeout: 10000 }
            );
            return response.data;
        } catch (error) {
            // ECONNRESET / ETIMEDOUT during heavy ingestion are transient — the
            // poller will retry on the next tick. Don't spam the log for these.
            const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'];
            if (!transient.includes(error.code)) {
                console.error('Get branch ingestion status error:', error.message);
            }
            return { status: 'unknown', error: error.message };
        }
    }

    /**
 * Ask a question across multiple or all repositories
 * @param {string} query - User's question
 * @param {Array} repoNames - Optional list of repo names (null = all repos)
 * @returns {Promise<Object>} - Answer with sources
 */
    static async queryAllRepos(query, repoNames = null) {
        try {
            const requestBody = {
                query: query
            };

            // Only add repo_names if provided
            if (repoNames && repoNames.length > 0) {
                requestBody.repo_names = repoNames;
            }

            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/query/all`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 180000  // 3 minutes
                }
            );

            return response.data;
        } catch (error) {
            console.error('Python agent query all error:', error.message);
            throw new Error(`Failed to get answer: ${error.response?.data?.detail || error.message}`);
        }
    }
}

module.exports = PythonAgentService;