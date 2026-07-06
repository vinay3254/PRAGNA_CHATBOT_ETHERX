---
name: run_everything
description: Triggered when the user says "run", "run everything", or requests starting the servers. Runs both the Flask backend and Vite frontend.
---
# Run Everything Skill

Whenever the user says "run" or asks to start the servers:
1. Start the Flask backend:
   - Command: `.venv\Scripts\python app.py`
   - Cwd: `backend`
2. Start the Vite frontend:
   - Command: `npm run dev`
   - Cwd: `chatbot-ui-vite`
3. Report the status of both tasks and the URLs to the user.
