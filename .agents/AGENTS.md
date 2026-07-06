# PRAGNA Chatbot Workspace Rules

This file defines project-specific guidelines, shortcuts, and behaviors for the PRAGNA Chatbot workspace.

## Rules

- **Startup Shortcut**:
  - Whenever the user says "run", "run everything", "start the product", or "start", the agent MUST automatically launch both the backend Flask server and the frontend Vite development server.
  - Backend configuration:
    - Working Directory: `backend`
    - Command: `.venv\Scripts\python app.py`
    - Execution: Background task
  - Frontend configuration:
    - Working Directory: `chatbot-ui-vite`
    - Command: `npm run dev`
    - Execution: Background task
  - After starting them, the agent should report their status and URLs.
