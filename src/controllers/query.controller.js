const PythonAgentService = require('../services/pythonAgent.service');
const UserModel = require('../models/user.model');
const ConversationModel = require('../models/conversation.model');

/**
 * Ask a question about a specific repository
 * POST /api/query
 * Body: { repo_name, query, conversation_id? }
 */
async function askQuestion(req, res) {
  try {
    const { repo_name, query, conversation_id } = req.body;
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
      pythonConversationId = conversation_id; // Using same ID for Python
    }

    // Call Python agent to get answer
    const pythonResponse = await PythonAgentService.queryRepo(
      repo_name,
      query,
      pythonConversationId
    );

    // Store user's question in database
    if (localConversationId) {
      // Check if this is the first message in the conversation
      const existingMessages = await ConversationModel.getMessages(localConversationId);
      const isFirstMessage = existingMessages.length === 0;

      // If first message, generate title using Groq
      if (isFirstMessage) {
        const GroqService = require('../services/groq.service');
        const generatedTitle = await GroqService.generateTitle(query);
        await ConversationModel.updateTitle(localConversationId, generatedTitle);
        console.log(`📝 Generated title for conversation ${localConversationId}: ${generatedTitle}`);
      }

      await ConversationModel.addMessage(
        localConversationId,
        'user',
        query,
        null,
        null,
        null
      );

      // Store assistant's answer
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
 * POST /api/conversation
 * Body: { repo_name, title? }
 */
async function startConversation(req, res) {
  try {
    const { repo_name, title } = req.body;
    const userId = req.userId;

    if (!repo_name) {
      return res.status(400).json({
        success: false,
        message: 'repo_name is required'
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

    // Start conversation in Python agent
    const pythonConversationId = await PythonAgentService.startConversation(repo_name);

    // Create conversation in local database
    const conversation = await ConversationModel.create(
      fullUser.github_id,
      repo_name,
      null // Title will be generated from first message
    );

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
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start conversation'
    });
  }
}

/**
 * Get all conversations for the authenticated user
 * GET /api/conversation
 */
async function getConversations(req, res) {
  try {
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    const conversations = await ConversationModel.findByUser(fullUser.github_id);

    res.json({
      success: true,
      data: {
        conversations: conversations,
        total: conversations.length
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversations'
    });
  }
}

/**
 * Get a single conversation with all messages
 * GET /api/conversation/:id
 */
async function getConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);

    // Get conversation
    const conversation = await ConversationModel.findById(id, fullUser.github_id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Get messages
    const messages = await ConversationModel.getMessages(id);

    res.json({
      success: true,
      data: {
        conversation: conversation,
        messages: messages,
        total_messages: messages.length
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversation'
    });
  }
}

/**
 * Delete a conversation
 * DELETE /api/conversation/:id
 */
async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    await ConversationModel.delete(id, fullUser.github_id);

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete conversation'
    });
  }
  
}

/**
 * Ask a question about a specific repository
 * POST /api/query
 * Body: { repo_name, query, conversation_id? }
 */
async function askQuestion(req, res) {
  try {
    const { repo_name, query, conversation_id } = req.body;
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
      pythonConversationId = conversation_id; // Using same ID for Python
    }

    // Call Python agent to get answer
    const pythonResponse = await PythonAgentService.queryRepo(
      repo_name,
      query,
      pythonConversationId
    );

    // Store user's question in database
    if (localConversationId) {
      // Check if this is the first message in the conversation
      const existingMessages = await ConversationModel.getMessages(localConversationId);
      const isFirstMessage = existingMessages.length === 0;

      // If first message, generate title using Groq
      if (isFirstMessage) {
        const GroqService = require('../services/groq.service');
        const generatedTitle = await GroqService.generateTitle(query);
        await ConversationModel.updateTitle(localConversationId, generatedTitle);
        console.log(`📝 Generated title for conversation ${localConversationId}: ${generatedTitle}`);
      }

      await ConversationModel.addMessage(
        localConversationId,
        'user',
        query,
        null,
        null,
        null
      );

      // Store assistant's answer
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
 * POST /api/conversation
 * Body: { repo_name, title? }
 */
async function startConversation(req, res) {
  try {
    const { repo_name, title } = req.body;
    const userId = req.userId;

    if (!repo_name) {
      return res.status(400).json({
        success: false,
        message: 'repo_name is required'
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

    // Start conversation in Python agent
    const pythonConversationId = await PythonAgentService.startConversation(repo_name);

    // Create conversation in local database
    const conversation = await ConversationModel.create(
      fullUser.github_id,
      repo_name,
      null // Title will be generated from first message
    );

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
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start conversation'
    });
  }
}

/**
 * Get all conversations for the authenticated user
 * GET /api/conversation
 */
async function getConversations(req, res) {
  try {
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    const conversations = await ConversationModel.findByUser(fullUser.github_id);

    res.json({
      success: true,
      data: {
        conversations: conversations,
        total: conversations.length
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversations'
    });
  }
}

/**
 * Get a single conversation with all messages
 * GET /api/conversation/:id
 */
async function getConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);

    // Get conversation
    const conversation = await ConversationModel.findById(id, fullUser.github_id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Get messages
    const messages = await ConversationModel.getMessages(id);

    res.json({
      success: true,
      data: {
        conversation: conversation,
        messages: messages,
        total_messages: messages.length
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversation'
    });
  }
}

/**
 * Delete a conversation
 * DELETE /api/conversation/:id
 */
async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const fullUser = await UserModel.findByEmail(user.email);
    await ConversationModel.delete(id, fullUser.github_id);

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete conversation'
    });
  }
}

/**
 * Ask a question across multiple or all repositories
 */
async function askAllRepos(req, res) {
  try {
    const { query, repo_names } = req.body;
    const userId = req.userId;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'query is required'
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

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
    console.error('Query all repos error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get answer'
    });
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