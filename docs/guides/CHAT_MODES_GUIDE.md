# Chat Modes Implementation Guide

## Overview

**Chat Modes** allow users to specify the conversational style and behavior of the AI assistant. Instead of treating mode selections as user input messages, modes now function as **persistent context modifiers** that affect all subsequent responses until changed.

## Architecture

### Frontend Flow

```
User selects mode button
    ↓
ChatContext.chatMode state updated
    ↓
Mode stored in localStorage (persists across sessions)
    ↓
User sends message
    ↓
streamText() called with chatMode parameter
    ↓
Backend receives chat_mode in request body
```

### Backend Flow

```
Request received with chat_mode parameter
    ↓
llm.get_response/get_response_stream called with chat_mode
    ↓
build_prompt() incorporates mode into system prompt
    ↓
Mode-specific instructions added to system message
    ↓
LLM responds with mode-appropriate behavior
```

## Available Chat Modes

| Mode | Icon | Description | Use Case |
|------|------|-------------|----------|
| **General Chat** | 💬 | Standard helpful assistant | Default conversational mode |
| **Explain Concepts** | 📚 | Educational, breaks down complex ideas | Learning new topics, understanding theory |
| **Generate Ideas** | 💡 | Creative brainstorming | Ideation, creative projects |
| **Write Content** | ✍️ | Professional writing | Blog posts, articles, emails |
| **Code Assistance** | 💻 | Expert programmer | Coding help, debugging |
| **Ask Questions** | ❓ | Thoughtful inquiry | Deep exploration, learning |
| **Creative Writing** | 🎭 | Storyteller, narrative focus | Fiction, storytelling, creative projects |

## Mode Instructions

Each mode has specific system prompt instructions:

### General Chat
```
"You are Pragna, a fast multilingual AI assistant."
```

### Explain Concepts
```
"You are Pragna, an educator specializing in clear explanations. 
Break down complex concepts into digestible parts. Use examples and analogies."
```

### Generate Ideas
```
"You are Pragna, a creative brainstorming partner. 
Generate innovative, diverse ideas. Encourage thinking outside the box."
```

### Write Content
```
"You are Pragna, a professional content writer. 
Create engaging, well-structured, polished content."
```

### Code Assistance
```
"You are Pragna, an expert programmer. 
Provide clean, efficient, well-commented code with explanations."
```

### Ask Questions
```
"You are Pragna, a thoughtful conversationalist who asks probing questions 
to deepen understanding."
```

### Creative Writing
```
"You are Pragna, a creative storyteller. 
Craft vivid narratives, interesting characters, and engaging dialogue."
```

## Implementation Details

### Frontend Components

**ChatModeSelector.jsx** - UI Component
- Displays 7 mode buttons with icons
- Highlights currently selected mode
- Persists selection in context

**chat_modes.css** - Styling
- Golden accent color (#d4af37)
- Grid layout for responsive design
- Hover and active states

### Context Integration

**ChatContext.jsx** - State Management
```jsx
const [chatMode, setChatMode] = useState(() => {
  return localStorage.getItem("pragna_chat_mode") || "general";
});
```

**Features:**
- Persists mode across browser sessions
- Affects ALL subsequent messages
- Can be changed at any time

### API Integration

**api.js** - Updated streamText function
```javascript
export const streamText = async (text, language, user_id, chatMode = "general", onChunk) => {
  const response = await fetch(`${BASE_URL}/api/chat_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      text, 
      message: text, 
      language, 
      user_id, 
      chat_mode: chatMode  // ← New parameter
    }),
  });
  // ...
}
```

### Backend Integration

**app.py** - Updated endpoints
- `/api/chat` - Accepts `chat_mode` parameter
- `/api/chat_stream` - Accepts `chat_mode` parameter

**llm_service.py** - Mode handling
```python
def get_response(self, message, language='en', user_id='default', chat_mode='general'):
    # Chat mode is passed through to build_prompt

def get_response_stream(self, message, language='en', user_id='default', chat_mode='general'):
    # Stream mode is also supported
```

**prompt_builder.py** - Mode incorporation
```python
def build_prompt(query, history, language, context_text, chat_mode="general"):
    mode_instructions = {
        "general": "You are Pragna, a fast multilingual AI assistant.",
        "explain_concepts": "You are Pragna, an educator...",
        # ... etc
    }
    
    base_instruction = mode_instructions.get(chat_mode, "...")
    # Mode instruction is prepended to system prompt
```

## User Experience

### Before (Old Way)
1. User clicks "Explain concepts" button
2. Text "Explain concepts" sent as user message
3. Chatbot responds to the text literally
4. Mode lost after one message

### After (New Way)
1. User clicks "Explain concepts" button
2. Button becomes highlighted (active state)
3. All subsequent messages use explanation tone
4. Mode persists until user selects different mode
5. Mode saved locally - remembered on next visit

## Usage Example

**Scenario: Student wants to learn about quantum mechanics**

1. **Student arrives at chat**
   - Sees mode selector with 7 options
   - "General Chat" is default

2. **Student clicks "Explain Concepts" mode**
   - Button highlights in gold
   - Mode persists in memory

3. **Student asks: "What is quantum superposition?"**
   - Request includes `chat_mode: "explain_concepts"`
   - Backend recognizes mode
   - Prompt includes: "You are an educator specializing in clear explanations..."
   - Response breaks down concept into digestible parts with examples

4. **Student asks follow-up: "Can you give another example?"**
   - Mode still active (button still highlighted)
   - Response continues in educational tone

5. **Student switches to "Creative Writing" mode**
   - Button changes
   - **Student asks: "Write a short story about quantum mechanics"**
   - Now response is narrative and storytelling focused

## Testing the Feature

### Test with cURL

```bash
# With General Chat mode
curl -X POST http://localhost:5000/api/chat_stream \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What is machine learning?",
    "language": "en",
    "user_id": "test_user",
    "chat_mode": "explain_concepts"
  }'

# Response should be educational and tutorial-focused
```

### Test with Frontend

1. Open http://localhost:5173
2. Click "Explain Concepts" button (becomes highlighted)
3. Ask: "What is REST API?"
4. Response should break down the concept educationally

5. Click "Code Assistance" button
6. Ask: "How do I build a REST API?"
7. Response should include code examples

## Configuration

Modes are defined in two places:

**Frontend** - `src/components/chat/ChatModeSelector.jsx`
```javascript
const CHAT_MODES = [
  { id: "general", label: "General Chat", ... },
  // Add new modes here
];
```

**Backend** - `services/prompt_builder.py`
```python
mode_instructions = {
    "general": "...",
    # Add mode instructions here
}
```

**Both must match!** Always update both files when adding new modes.

## Adding New Modes

### Step 1: Add to Frontend (ChatModeSelector.jsx)
```javascript
{
  id: "analysis",
  label: "Data Analysis",
  icon: "📊",
  description: "Statistical insights",
}
```

### Step 2: Add to Backend (prompt_builder.py)
```python
"analysis": "You are Pragna, a data analyst. Provide statistical insights and visualizations."
```

### Step 3: Test
- Restart backend
- Refresh frontend
- New mode should appear and work

## Persistence & State

- **Frontend**: Mode saved in `localStorage` with key `pragna_chat_mode`
- **Duration**: Persists across browser sessions
- **Reset**: Clear browser localStorage to reset to "general"
- **Per-Session**: Each conversation inherits the selected mode

## Future Enhancements

1. **User Profiles**: Save preferred modes per user account
2. **Mode Customization**: Allow users to create custom modes
3. **Mode Suggestions**: Recommend modes based on query type
4. **Mode History**: Track which mode was most useful
5. **Team Modes**: Organization-specific mode templates

## Troubleshooting

### Mode not applying?
- Check that `chat_mode` is being passed in request body
- Verify mode name matches in both frontend and backend
- Restart backend server

### Buttons not highlighting?
- Ensure ChatContext is properly updated
- Check CSS for `.active` class styling
- Verify ChatModeSelector component is imported

### Frontend not sending mode?
- Check browser console for errors
- Verify `streamText()` is receiving chatMode parameter
- Test API directly with cURL

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `ChatContext.jsx` | `+chatMode` state | Central mode storage |
| `ChatWindow.jsx` | Import ChatModeSelector, use in empty state | Display selector |
| `api.js` | Add `chatMode` param to streamText | Pass mode to backend |
| `llm_service.py` | Accept `chat_mode` in get_response & stream | Use mode in responses |
| `prompt_builder.py` | Mode instructions dict & parameter | Inject into system prompt |
| `app.py` | Accept `chat_mode` in endpoints | Backend routing |
| `ChatModeSelector.jsx` | NEW - 7 mode buttons | UI component |
| `chat_modes.css` | NEW - Mode button styling | Golden theme styling |

---

**Chat Modes are now fully functional!** Users can select a mode once and have all their messages answered in that style until they switch modes. 🎉
