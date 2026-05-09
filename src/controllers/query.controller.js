const PythonAgentService = require('../services/pythonAgent.service');
const UserModel = require('../models/user.model');
const ConversationModel = require('../models/conversation.model');

/**
 * Ask a question about a specific repository
 * POST /api/query
 * Body: { repo_name, query, conversation_id?, branch_filter? }
 */
async function askQuestion(req, res) {
  try {
    const { repo_name, query, conversation_id, branch_filter } = req.body;
    const isStream = req.query.stream === 'true';
    const userId = req.userId;

    // Validation
    if (!repo_name || !query) {
      return res.status(400).json({
        success: false,
        message: 'repo_name and query are required'
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

    // Validate conversation if provided
    let pythonConversationId = null;
    let localConversationId = null;

    if (conversation_id) {
      const conversation = await ConversationModel.findById(conversation_id, fullUser.github_id);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      localConversationId = conversation_id;
      pythonConversationId = conversation_id;
    }

    // --- HANDLE STREAMING ---
    if (isStream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache');

      const stream = await PythonAgentService.streamQueryRepo(
        repo_name,
        query,
        pythonConversationId,
        branch_filter
      );

      let fullAnswer = "";
      let jsonBuffer = "";

      stream.on('data', (chunk) => {
        const text = chunk.toString();

        if (text.trim().startsWith('{') || jsonBuffer) {
          jsonBuffer += text;
          try {
            const parsed = JSON.parse(jsonBuffer);
            const content = parsed.answer || parsed.content;
            if (content) {
              fullAnswer = content;
              res.write(content);
              jsonBuffer = "";
            }
          } catch (e) {
            const match = jsonBuffer.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
              try {
                const partial = JSON.parse(`"${match[1]}"`);
                const newPart = partial.substring(fullAnswer.length);
                if (newPart) {
                  fullAnswer += newPart;
                  res.write(newPart);
                }
              } catch (err) { }
            }
          }
        } else {
          fullAnswer += text;
          res.write(text);
        }
      });

      stream.on('end', async () => {
        if (localConversationId) {
          try {
            // Check if first message to generate title
            const existingMessages = await ConversationModel.getMessages(localConversationId);
            if (existingMessages.length === 0) {
              const GroqService = require('../services/groq.service');
              const generatedTitle = await GroqService.generateTitle(query);
              await ConversationModel.updateTitle(localConversationId, generatedTitle);
            }
            await ConversationModel.addMessage(localConversationId, 'user', query, null, null, null);
            await ConversationModel.addMessage(localConversationId, 'assistant', fullAnswer, [], 'ollama-streaming', 0);
          } catch (e) {
            console.error('Error storing streamed message:', e);
          }
        }
        res.end();
      });

      stream.on('error', (err) => {
        console.error('Stream error:', err);
        res.write(`\n⚠️ Error during reasoning: ${err.message}`);
        res.end();
      });

      return;
    }

    // --- HANDLE NON-STREAMING ---
    const pythonResponse = await PythonAgentService.queryRepo(
      repo_name,
      query,
      pythonConversationId,
      branch_filter
    );

    // Store in DB
    if (localConversationId) {
      const existingMessages = await ConversationModel.getMessages(localConversationId);
      const isFirstMessage = existingMessages.length === 0;

      // If first message, generate title using Groq (ONLY ONCE)
      if (isFirstMessage) {
        const GroqService = require('../services/groq.service');
        const generatedTitle = await GroqService.generateTitle(query);
        await ConversationModel.updateTitle(localConversationId, generatedTitle);
        console.log(`📝 Generated title for conversation ${localConversationId}: ${generatedTitle}`);
      }

      await ConversationModel.addMessage(localConversationId, 'user', query, null, null, null);
      await ConversationModel.addMessage(
        localConversationId,
        'assistant',
        pythonResponse.answer,
        pythonResponse.sources || [],
        pythonResponse.model,
        pythonResponse.tokens_used
      );
    }

    res.json({
      success: true,
      data: {
        answer: pythonResponse.answer,
        sources: pythonResponse.sources || [],
        model: pythonResponse.model,
        tokens_used: pythonResponse.tokens_used || 0,
        conversation_id: localConversationId
      }
    });

  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get answer'
    });
  }
}

/**
 * Start a new conversation
 */
async function startConversation(req, res) {
  try {
    const { repo_name, title } = req.body;
    const userId = req.userId;

    if (!repo_name) {
      return res.status(400).json({ success: false, message: 'repo_name is required' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    const pythonConversationId = await PythonAgentService.startConversation(repo_name);
    const conversation = await ConversationModel.create(fullUser.github_id, repo_name, null);

    res.json({
      success: true,
      data: {
        conversation_id: conversation.id,
        repo_name: repo_name,
        title: conversation.title,
        created_at: conversation.created_at
      }
    });
  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to start conversation' });
  }
}

async function getConversations(req, res) {
  try {
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const fullUser = await UserModel.findByEmail(user.email);
    const conversations = await ConversationModel.findByUser(fullUser.github_id);
    res.json({ success: true, data: { conversations, total: conversations.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get conversations' });
  }
}

async function getConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const fullUser = await UserModel.findByEmail(user.email);
    const conversation = await ConversationModel.findById(id, fullUser.github_id);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const messages = await ConversationModel.getMessages(id);
    res.json({ success: true, data: { conversation, messages, total_messages: messages.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get conversation' });
  }
}

async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const fullUser = await UserModel.findByEmail(user.email);
    await ConversationModel.delete(id, fullUser.github_id);
    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete conversation' });
  }
}

async function askAllRepos(req, res) {
  try {
    const { query, repo_names } = req.body;
    const userId = req.userId;
    if (!query) return res.status(400).json({ success: false, message: 'query is required' });
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const pythonResponse = await PythonAgentService.queryAllRepos(query, repo_names);
    res.json({
      success: true,
      data: {
        answer: pythonResponse.answer,
        sources: pythonResponse.sources || [],
        model: pythonResponse.model,
        tokens_used: pythonResponse.tokens_used || 0,
        repos_searched: pythonResponse.repos_searched || repo_names || 'all',
        repos_with_results: pythonResponse.repos_with_results || []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to get answer' });
  }
}

module.exports = {
  askQuestion,
  startConversation,
  getConversations,
  getConversation,
  deleteConversation,
  askAllRepos,
};