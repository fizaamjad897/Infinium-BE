const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

class GroqService {
  
  static async generateTitle(message) {
    try {
      if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith('gsk_')) {
        console.error('❌ Invalid or missing GROQ_API_KEY');
        return 'New Conversation';
      }

      console.log(`📝 Generating title for: "${message.substring(0, 50)}..."`);

      const response = await axios.post(
        `${GROQ_API_URL}/chat/completions`,
        {
          model: 'llama-3.3-70b-versatile',  // ← NEW MODEL (current)
          // Alternative models that work:
          // 'llama-3.2-3b-preview'
          // 'mixtral-8x7b-32768'
          // 'gemma2-9b-it'
          messages: [
            {
              role: 'system',
              content: 'Generate a very short title (max 6 words, no quotes, no punctuation at end) for this conversation based on the user\'s first message. Just return the title, nothing else.'
            },
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.3,
          max_tokens: 30
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      let title = response.data.choices[0].message.content.trim();
      title = title.replace(/^["']|["']$/g, '');
      title = title.substring(0, 60);
      
      console.log(`✅ Generated title: "${title}"`);
      return title || 'New Conversation';
      
    } catch (error) {
      console.error('❌ Groq title generation error:', error.response?.data?.error?.message || error.message);
      return 'New Conversation';
    }
  }
}

module.exports = GroqService;