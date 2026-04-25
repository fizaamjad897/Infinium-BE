// Purpose: Handle all GitHub API calls (separate from controllers for clean code).

const axios = require('axios');

/**
 * GitHub Service - Handles all GitHub API interactions
 */
class GitHubService {

    /**
     * Exchange authorization code for access token
     * @param {string} code - GitHub OAuth code from callback
     * @returns {Promise<string>} - GitHub access token
     */
    static async getAccessToken(code) {
        try {
            const response = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code: code,
                    redirect_uri: process.env.GITHUB_CALLBACK_URL
                },
                {
                    headers: {
                        'Accept': 'application/json'
                    },
                    timeout: 10000 // 10 seconds timeout
                }
            );

            if (response.data.error) {
                throw new Error(response.data.error_description || 'Failed to get access token');
            }

            return response.data.access_token;
        } catch (error) {
            console.error('GitHub token exchange failed:', error.message);
            throw new Error('Failed to exchange GitHub code for access token');
        }
    }

    /**
     * Fetch GitHub user profile using access token
     * @param {string} accessToken - GitHub access token
     * @returns {Promise<Object>} - GitHub user data
     */
    static async getUserProfile(accessToken) {
        try {
            const response = await axios.get('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            // If email is null, generate GitHub's noreply email
            let email = response.data.email;
            if (!email) {
                email = `${response.data.login}@users.noreply.github.com`;
            }

            return {
                github_id: response.data.id,
                email: response.data.email,
                username: response.data.login,
                full_name: response.data.name || response.data.login,
                avatar_url: response.data.avatar_url
            };
        } catch (error) {
            console.error('GitHub profile fetch failed:', error.message);
            throw new Error('Failed to fetch GitHub user profile');
        }
    }

    /**
 * Get user's GitHub repositories (for future use)
 * @param {string} accessToken - GitHub access token
 * @param {number} page - Page number
 * @param {number} perPage - Items per page
 * @returns {Promise<Array>} - List of repositories
 */
    static async getUserRepos(accessToken, page = 1, perPage = 100) {
        try {
            const response = await axios.get('https://api.github.com/user/repos', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                params: {
                    sort: 'updated',
                    per_page: perPage,
                    page: page,
                },
                timeout: 15000
            });

            return response.data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                private: repo.private,
                html_url: repo.html_url,
                clone_url: repo.clone_url,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                default_branch: repo.default_branch,
                updated_at: repo.updated_at,
                size: repo.size
            }));
        } catch (error) {
            console.error('GitHub repos fetch failed:', error.message);
            throw new Error('Failed to fetch GitHub repositories');
        }
    }

    /**
     * Get a single repository by name
     * @param {string} accessToken - GitHub access token
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Object>} - Repository data
     */
    static async getRepo(accessToken, owner, repo) {
        try {
            const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            return {
                id: response.data.id,
                name: response.data.name,
                full_name: response.data.full_name,
                private: response.data.private,
                clone_url: response.data.clone_url,
                html_url: response.data.html_url,
                description: response.data.description,
                language: response.data.language,
                stars: response.data.stargazers_count,
                default_branch: response.data.default_branch
            };
        } catch (error) {
            console.error('GitHub repo fetch failed:', error.message);
            throw new Error('Failed to fetch repository details');
        }
    }


}

module.exports = GitHubService;