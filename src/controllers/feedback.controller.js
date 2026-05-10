const PythonAgentService = require('../services/pythonAgent.service');

/**
 * Submit feedback on any AI surface (query / refactor / explain).
 * POST /api/feedback
 * Body: { target_type, target_id, query, answer, rating (1-5), comment, repo_name, metadata }
 */
async function submitFeedback(req, res) {
  try {
    const { rating } = req.body || {};
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'rating must be a number between 1 and 5'
      });
    }
    const data = await PythonAgentService.submitFeedback(req.body);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Feedback submit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save feedback'
    });
  }
}

/**
 * GET /api/feedback/stats?target_type=refactor
 */
async function feedbackStats(req, res) {
  try {
    const targetType = req.query.target_type || null;
    const data = await PythonAgentService.getFeedbackStats(targetType);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Feedback stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/feedback?limit=50&target_type=refactor&repo_name=foo_bar
 */
async function listFeedback(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const targetType = req.query.target_type || null;
    const repoName = req.query.repo_name || null;
    const data = await PythonAgentService.listFeedback({ limit, targetType, repoName });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Feedback list error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { submitFeedback, feedbackStats, listFeedback };
