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

            // Add GitHub token as X-GitHub-Token header (matches Python's expectation)
            if (githubToken) {
                headers['X-GitHub-Token'] = githubToken;
            }

            const response = await axios.post(
                `${PYTHON_AGENT_URL}/api/ingest`,
                {
                    repo_url: repoUrl,
                    repo_name: repoName
                },
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
    static async getIngestionStatus(repoName) {
        try {
            const response = await axios.get(
                `${PYTHON_AGENT_URL}/api/repos/${repoName}/status`,
                { timeout: 10000 }
            );

            return response.data;
        } catch (error) {
            console.error('Get ingestion status error:', error.message);
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
   * Ask a question about a specific repository
   * @param {string} repoName - Repository name
   * @param {string} query - User's question
   * @param {string} conversationId - Optional conversation ID for context
   * @returns {Promise<Object>} - Answer with sources
   */
    static async queryRepo(repoName, query, conversationId = null) {
        try {
            const requestBody = {
                query: query,
                repo_name: repoName,
                use_hybrid: true,
                top_k: 5
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
                    timeout: 60000  // 60 seconds for LLM generation
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
}

module.exports = PythonAgentService;