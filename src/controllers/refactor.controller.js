const PythonAgentService = require('../services/pythonAgent.service');

/**
 * Trigger a granular code refactor on the Python agent and return the diff.
 * Read-only: returns before/after/diff. Caller (FE) is responsible for showing
 * the diff and letting the user apply it manually.
 *
 * POST /api/code/refactor
 * Body: { repo_name, granularity: "function"|"file", target, instruction, model?, include_callers?, use_neighbour_context? }
 */
async function refactor(req, res) {
  try {
    const { repo_name, granularity, target, instruction } = req.body || {};
    if (!repo_name || !target || !instruction) {
      return res.status(400).json({
        success: false,
        message: 'repo_name, target, and instruction are required'
      });
    }
    if (granularity && !['function', 'file'].includes(granularity)) {
      return res.status(400).json({
        success: false,
        message: 'granularity must be "function" or "file"'
      });
    }

    const data = await PythonAgentService.refactor(req.body);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Refactor controller error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to refactor'
    });
  }
}

module.exports = { refactor };
