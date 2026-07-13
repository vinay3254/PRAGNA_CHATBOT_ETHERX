# Custom Personas + Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create named, backend-persisted personas (custom system prompts) selectable per chat session, and type `/`-prefixed slash commands in the chat input as shortcuts for capabilities that already exist in the app.

**Architecture:** Personas are backend-persisted per-user records (SQLite, JWT-scoped CRUD routes) whose `system_prompt` replaces the app's auto-inferred style message for a turn when active. Slash commands are a purely client-side parser added to `InputBar.jsx` (the only free-typed input surface) that dispatches directly to existing frontend functions instead of sending the text to the LLM.

**Tech Stack:** Flask + SQLite (`backend/database.py`), JWT auth (`backend/auth.py`'s `require_auth`), React/Vite frontend (`ChatContext.jsx`, `api.js`, `ChatWindow.jsx`, `InputBar.jsx`, `pragna/App.jsx`, `SettingsModal.jsx`).

## Global Constraints

- The full chat-completion call chain for the app's actual UI: `POST /api/chat_stream` (`backend/app.py:1649`) → `orchestrator.handle_query(...)` (`backend/services/orchestrator.py:19-27`) → `self.llm.get_response(...)` (`backend/llm_service.py:185-193`). This is the *only* call chain in scope for `persona_system_prompt` — do not modify the other `orchestrator.handle_query` call sites in `app.py` (lines ~580, ~660, ~706), which belong to routes the current frontend doesn't use for its chat UI.
- Inside `get_response` (`backend/llm_service.py:310-321`), the system message is currently always built from the auto-inferred style profile. When `persona_system_prompt` is provided (non-empty), it **replaces** that computation entirely — it is never combined/stacked with the style message.
- New DB table and routes follow the exact existing patterns in `backend/database.py` and `backend/app.py`: `hashlib.md5(f"...{datetime.now()}".encode()).hexdigest()` for IDs, `get_connection()`/`conn.commit()`/`conn.close()` per call, `@require_auth` + `request.user_id` for auth scoping (see `backend/app.py:1969-1994`'s `/api/conversations` route as the reference).
- Frontend persona state (`personas`, `activePersonaId`) lives in `ChatContext.jsx`, mirroring the exact existing `chatMode`/`setChatMode` pattern (`chatbot-ui-vite/src/context/ChatContext.jsx:49-51,77-80`) — a single current-selection value persisted to `localStorage`, not bound to individual past conversations.
- Slash-command parsing is added **only** to `InputBar.jsx` — `ChatWindow.jsx`'s suggestion sends and `pragna/App.jsx`'s quick prompts handle pre-built strings, not free-typed user input, so they are out of scope for slash commands.
- All new frontend API calls needing auth reuse the existing `_authHeaders()` helper already in `chatbot-ui-vite/src/api/api.js:363-366`.
- This repo has no pytest suite — write new backend tests as standalone `test_*.py` scripts using plain `assert` statements and printed progress, run individually with `python test_x.py` (see `CLAUDE.md`).
- No frontend test runner exists in this repo — frontend verification is `npm run build && npm run lint` plus manual exercise in the browser.

---

### Task 1: Personas database layer

**Files:**
- Modify: `backend/database.py`
- Test: `backend/test_personas_db.py`

**Interfaces:**
- Produces: `db.create_persona(user_id, name, system_prompt) -> str` (persona id), `db.list_personas(user_id) -> list[dict]`, `db.get_persona(persona_id, user_id) -> dict | None`, `db.update_persona(persona_id, user_id, name, system_prompt) -> bool`, `db.delete_persona(persona_id, user_id) -> bool`. Each dict has keys `id, user_id, name, system_prompt, created_at, updated_at`. Used by Task 2's routes.

- [ ] **Step 1: Add the `personas` table**

In `backend/database.py`, inside `init_db()`, immediately after the `api_usage` table creation and before `conn.commit()` (currently `database.py:69-82`):
```python
        # API usage tracking
        c.execute('''
            CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                endpoint TEXT,
                tokens_used INTEGER,
                cost REAL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
```
becomes:
```python
        # API usage tracking
        c.execute('''
            CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                endpoint TEXT,
                tokens_used INTEGER,
                cost REAL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Personas table (custom named system prompts)
        c.execute('''
            CREATE TABLE IF NOT EXISTS personas (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
```

- [ ] **Step 2: Write the failing test**

Create `backend/test_personas_db.py`:
```python
"""Test Database persona CRUD methods directly (no Flask needed)."""
from database import db


def test_create_and_list_persona():
    user_id = "test-user-personas-1"
    persona_id = db.create_persona(user_id, "Concise Coder", "Respond with terse, code-first answers.")
    assert persona_id, "create_persona should return a non-empty id"

    personas = db.list_personas(user_id)
    assert any(p["id"] == persona_id for p in personas), personas
    created = next(p for p in personas if p["id"] == persona_id)
    assert created["name"] == "Concise Coder"
    assert created["system_prompt"] == "Respond with terse, code-first answers."
    print("PASS: create and list persona")


def test_update_persona():
    user_id = "test-user-personas-2"
    persona_id = db.create_persona(user_id, "Original Name", "Original prompt")
    updated = db.update_persona(persona_id, user_id, "New Name", "New prompt")
    assert updated is True

    persona = db.get_persona(persona_id, user_id)
    assert persona["name"] == "New Name"
    assert persona["system_prompt"] == "New prompt"
    print("PASS: update persona")


def test_update_persona_wrong_owner_fails():
    owner_id = "test-user-personas-3"
    other_id = "test-user-personas-4"
    persona_id = db.create_persona(owner_id, "Owned Persona", "prompt")

    result = db.update_persona(persona_id, other_id, "Hacked Name", "Hacked prompt")
    assert result is False, "update_persona must return False for another user's persona"

    persona = db.get_persona(persona_id, owner_id)
    assert persona["name"] == "Owned Persona", "persona must be unchanged after a rejected cross-user update"
    print("PASS: update_persona rejects wrong owner")


def test_delete_persona():
    user_id = "test-user-personas-5"
    persona_id = db.create_persona(user_id, "To Delete", "prompt")
    deleted = db.delete_persona(persona_id, user_id)
    assert deleted is True

    persona = db.get_persona(persona_id, user_id)
    assert persona is None
    print("PASS: delete persona")


def test_delete_persona_wrong_owner_fails():
    owner_id = "test-user-personas-6"
    other_id = "test-user-personas-7"
    persona_id = db.create_persona(owner_id, "Protected Persona", "prompt")

    result = db.delete_persona(persona_id, other_id)
    assert result is False, "delete_persona must return False for another user's persona"

    persona = db.get_persona(persona_id, owner_id)
    assert persona is not None, "persona must still exist after a rejected cross-user delete"
    print("PASS: delete_persona rejects wrong owner")


if __name__ == "__main__":
    test_create_and_list_persona()
    test_update_persona()
    test_update_persona_wrong_owner_fails()
    test_delete_persona()
    test_delete_persona_wrong_owner_fails()
    print("All persona DB tests passed.")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python test_personas_db.py`
Expected: FAIL with `AttributeError: 'Database' object has no attribute 'create_persona'`

- [ ] **Step 4: Implement the CRUD methods**

In `backend/database.py`, add these methods at the end of the `Database` class, immediately after `get_user_stats` and before the `# Global instance` comment:
```python
    # PERSONA MANAGEMENT
    def create_persona(self, user_id, name, system_prompt):
        """Create a new persona for a user"""
        persona_id = hashlib.md5(f"{user_id}{name}{datetime.now()}".encode()).hexdigest()

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO personas (id, user_id, name, system_prompt)
            VALUES (?, ?, ?, ?)
        ''', (persona_id, user_id, name, system_prompt))
        conn.commit()
        conn.close()
        return persona_id

    def list_personas(self, user_id):
        """List all personas belonging to a user"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM personas WHERE user_id = ? ORDER BY created_at ASC
        ''', (user_id,))
        personas = [dict(row) for row in c.fetchall()]
        conn.close()
        return personas

    def get_persona(self, persona_id, user_id):
        """Get a single persona, scoped to its owner"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM personas WHERE id = ? AND user_id = ?
        ''', (persona_id, user_id))
        persona = c.fetchone()
        conn.close()
        return dict(persona) if persona else None

    def update_persona(self, persona_id, user_id, name, system_prompt):
        """Update a persona's name/system_prompt. Returns False if it doesn't belong to user_id."""
        if not self.get_persona(persona_id, user_id):
            return False

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE personas
            SET name = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        ''', (name, system_prompt, persona_id, user_id))
        conn.commit()
        conn.close()
        return True

    def delete_persona(self, persona_id, user_id):
        """Delete a persona. Returns False if it doesn't belong to user_id."""
        if not self.get_persona(persona_id, user_id):
            return False

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('DELETE FROM personas WHERE id = ? AND user_id = ?', (persona_id, user_id))
        conn.commit()
        conn.close()
        return True
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python test_personas_db.py`
Expected: all 5 `PASS:` lines print, then `All persona DB tests passed.`

- [ ] **Step 6: Commit**

```bash
git add backend/database.py backend/test_personas_db.py
git commit -m "feat: add personas table and CRUD methods to Database"
```

---

### Task 2: Personas CRUD routes

**Files:**
- Modify: `backend/app.py`

**Interfaces:**
- Consumes: `db.create_persona`/`list_personas`/`get_persona`/`update_persona`/`delete_persona` from Task 1; `require_auth` (already imported in `app.py`) sets `request.user_id`.
- Produces: `GET /api/personas` → `200 {"personas": [...]}`. `POST /api/personas` → `201 {"id","name","system_prompt","created_at","updated_at"}` or `400 {"error"}`. `PUT /api/personas/<persona_id>` → `200 {...}` or `404 {"error"}`. `DELETE /api/personas/<persona_id>` → `200 {"success": true}` or `404 {"error"}`. Consumed by Task 4's frontend API client.

- [ ] **Step 1: Add the four routes**

In `backend/app.py`, immediately after the `get_conversations` route ends (currently `app.py:1994`, the line `return jsonify({'error': 'Failed to fetch conversations'}), 500`) and before `@app.route('/api/summarize', methods=['POST'])` (currently `app.py:1996`), add:
```python

@app.route('/api/personas', methods=['GET'])
@require_auth
def list_personas():
    """List the current user's personas"""
    try:
        personas = db.list_personas(request.user_id)
        return jsonify({'personas': personas}), 200
    except Exception as e:
        logger.error(f"Error listing personas: {e}")
        return jsonify({'error': 'Failed to list personas'}), 500


@app.route('/api/personas', methods=['POST'])
@require_auth
def create_persona():
    """Create a new persona for the current user"""
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        system_prompt = (data.get('system_prompt') or '').strip()

        if not name or not system_prompt:
            return jsonify({'error': 'name and system_prompt are required'}), 400

        persona_id = db.create_persona(request.user_id, name, system_prompt)
        persona = db.get_persona(persona_id, request.user_id)
        return jsonify(persona), 201
    except Exception as e:
        logger.error(f"Error creating persona: {e}")
        return jsonify({'error': 'Failed to create persona'}), 500


@app.route('/api/personas/<persona_id>', methods=['PUT'])
@require_auth
def update_persona(persona_id):
    """Update one of the current user's personas"""
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        system_prompt = (data.get('system_prompt') or '').strip()

        if not name or not system_prompt:
            return jsonify({'error': 'name and system_prompt are required'}), 400

        updated = db.update_persona(persona_id, request.user_id, name, system_prompt)
        if not updated:
            return jsonify({'error': 'Persona not found'}), 404

        persona = db.get_persona(persona_id, request.user_id)
        return jsonify(persona), 200
    except Exception as e:
        logger.error(f"Error updating persona: {e}")
        return jsonify({'error': 'Failed to update persona'}), 500


@app.route('/api/personas/<persona_id>', methods=['DELETE'])
@require_auth
def delete_persona(persona_id):
    """Delete one of the current user's personas"""
    try:
        deleted = db.delete_persona(persona_id, request.user_id)
        if not deleted:
            return jsonify({'error': 'Persona not found'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deleting persona: {e}")
        return jsonify({'error': 'Failed to delete persona'}), 500

```

- [ ] **Step 2: Restart the backend**

Run: `cd backend && python app.py`
Expected: server starts on port 5001 with no import/route-registration errors.

- [ ] **Step 3: Register two test users and verify auth + scoping**

With the backend running, in a separate terminal:
```bash
curl -s -X POST http://localhost:5001/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"persona_test_user_a","email":"persona_test_a@example.com","password":"testpass123"}'
curl -s -X POST http://localhost:5001/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"persona_test_user_b","email":"persona_test_b@example.com","password":"testpass123"}'
```
Expected: both return `201 {"user_id", "token", "message": "Registration successful"}` — record each `token` value for the next steps as `TOKEN_A` and `TOKEN_B`. (If the username/email already exists from a prior run, `register` returns `400`; reuse the token from a fresh login instead: `POST /api/auth/login` with the same username/password.)

- [ ] **Step 4: Verify unauthenticated access is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/api/personas
```
Expected: `401`

- [ ] **Step 5: Verify create/list/update/delete for user A, and that user B cannot see or modify user A's persona**

```bash
curl -s -X POST http://localhost:5001/api/personas -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN_A" \
  -d '{"name":"Concise Coder","system_prompt":"Respond with terse, code-first answers."}'
# record the returned "id" as PERSONA_ID

curl -s http://localhost:5001/api/personas -H "Authorization: Bearer TOKEN_A"
# expect: {"personas":[{"id": "PERSONA_ID", "name": "Concise Coder", ...}]}

curl -s http://localhost:5001/api/personas -H "Authorization: Bearer TOKEN_B"
# expect: {"personas":[]} - user B does not see user A's persona

curl -s -X PUT http://localhost:5001/api/personas/PERSONA_ID -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN_B" \
  -d '{"name":"Hacked","system_prompt":"Hacked"}'
# expect: 404 {"error": "Persona not found"} - user B cannot update user A's persona

curl -s -X DELETE http://localhost:5001/api/personas/PERSONA_ID -H "Authorization: Bearer TOKEN_A"
# expect: 200 {"success": true}
```

- [ ] **Step 6: Commit**

```bash
git add backend/app.py
git commit -m "feat: add /api/personas CRUD routes"
```

---

### Task 3: Wire persona_system_prompt into chat completion

**Files:**
- Modify: `backend/app.py` (`chat_stream` route)
- Modify: `backend/services/orchestrator.py`
- Modify: `backend/llm_service.py`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this task is independent of Tasks 1-2's DB/routes — the frontend sends the persona's prompt text directly, not an ID the backend would need to look up).
- Produces: `orchestrator.handle_query(..., persona_system_prompt: Optional[str] = None)` and `llm.get_response(..., persona_system_prompt: Optional[str] = None)` — both accept the new keyword, defaulting to `None` so every other existing call site (the three `orchestrator.handle_query` calls this task does NOT touch, at `app.py`'s other routes) is unaffected. Consumed by Tasks 7-9's frontend wiring, which will send this field in the `/api/chat_stream` request body.

- [ ] **Step 1: Read `persona_system_prompt` in the chat_stream route**

In `backend/app.py`, in the `chat_stream` function, change (currently `app.py:1660-1665`):
```python
        user_message = data.get('message', '').strip()
        language = _normalize_language_code(data.get('language', 'en'))
        user_id = data.get('user_id', 'default')
        chat_mode = data.get('chat_mode', 'general')
        model_override = data.get('model_override')
        fallback_models = data.get('fallback_models')
```
to:
```python
        user_message = data.get('message', '').strip()
        language = _normalize_language_code(data.get('language', 'en'))
        user_id = data.get('user_id', 'default')
        chat_mode = data.get('chat_mode', 'general')
        model_override = data.get('model_override')
        fallback_models = data.get('fallback_models')
        persona_system_prompt = data.get('persona_system_prompt')
```
Then change the `orchestrator.handle_query` call inside `stream_orchestrated_chunks` (currently `app.py:1674-1681`):
```python
            result = orchestrator.handle_query(
                user_message,
                language=language,
                user_id=user_id,
                chat_mode=chat_mode,
                model_override=model_override,
                fallback_models=fallback_models,
            )
```
to:
```python
            result = orchestrator.handle_query(
                user_message,
                language=language,
                user_id=user_id,
                chat_mode=chat_mode,
                model_override=model_override,
                fallback_models=fallback_models,
                persona_system_prompt=persona_system_prompt,
            )
```

- [ ] **Step 2: Thread the parameter through `orchestrator.handle_query`**

In `backend/services/orchestrator.py`, change the `handle_query` signature (currently `orchestrator.py:19-27`):
```python
    def handle_query(
        self,
        message: str,
        language: str = "en",
        user_id: str = "default",
        chat_mode: str = "general",
        model_override: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
```
to:
```python
    def handle_query(
        self,
        message: str,
        language: str = "en",
        user_id: str = "default",
        chat_mode: str = "general",
        model_override: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
        persona_system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
```
Then change the LLM call at the end of `handle_query` (currently `orchestrator.py:113-120`):
```python
        # Default: reuse existing classifier/router/planner + RAG flow through LLM service.
        ai_response, sources = self.llm.get_response(
            message,
            language,
            user_id,
            chat_mode,
            model_override=model_override,
            fallback_models=fallback_models,
        )
```
to:
```python
        # Default: reuse existing classifier/router/planner + RAG flow through LLM service.
        ai_response, sources = self.llm.get_response(
            message,
            language,
            user_id,
            chat_mode,
            model_override=model_override,
            fallback_models=fallback_models,
            persona_system_prompt=persona_system_prompt,
        )
```

- [ ] **Step 3: Use it in `get_response` to replace the auto-inferred style message**

In `backend/llm_service.py`, change the `get_response` signature (currently `llm_service.py:185-193`):
```python
    def get_response(
        self,
        message: str,
        language: str = 'en',
        user_id: str = 'default',
        chat_mode: str = 'general',
        model_override: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
    ) -> tuple:
```
to:
```python
    def get_response(
        self,
        message: str,
        language: str = 'en',
        user_id: str = 'default',
        chat_mode: str = 'general',
        model_override: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
        persona_system_prompt: Optional[str] = None,
    ) -> tuple:
```
Then change the style-message construction block (currently `llm_service.py:310-321`):
```python
            # Derive user style profile from history and prepend style adaptation directive
            style = style_profile.get_style_profile(user_id, max_messages=self.max_history)
            
            # Detect tone from CURRENT message and override profile tone if detected
            current_tone = tone_detector.detect_tone(message)
            if current_tone != "neutral":
                style["tone"] = current_tone
                logger.info(f"Detected message tone: {current_tone}. Overriding profile tone.")
            
            # Pass language and chat_mode to style_system_message so it includes both style AND mode prefix
            style_msg = style_profile.style_system_message(style, language, chat_mode)
            prompt_messages.insert(0, {"role": "system", "content": style_msg})
```
to:
```python
            if persona_system_prompt:
                # An active custom persona replaces the auto-inferred style message entirely,
                # rather than stacking both and risking conflicting instructions.
                system_msg = persona_system_prompt
            else:
                # Derive user style profile from history and prepend style adaptation directive
                style = style_profile.get_style_profile(user_id, max_messages=self.max_history)

                # Detect tone from CURRENT message and override profile tone if detected
                current_tone = tone_detector.detect_tone(message)
                if current_tone != "neutral":
                    style["tone"] = current_tone
                    logger.info(f"Detected message tone: {current_tone}. Overriding profile tone.")

                # Pass language and chat_mode to style_system_message so it includes both style AND mode prefix
                system_msg = style_profile.style_system_message(style, language, chat_mode)

            prompt_messages.insert(0, {"role": "system", "content": system_msg})
```

- [ ] **Step 4: Restart the backend**

Run: `cd backend && python app.py`
Expected: server starts with no errors.

- [ ] **Step 5: Verify default behavior (no persona) is unchanged**

```bash
curl -s -X POST http://localhost:5001/api/chat_stream -H "Content-Type: application/json" \
  -d '{"message":"Say hello in one short sentence.","language":"en","user_id":"persona-verify-1","chat_mode":"general"}'
```
Expected: `200` with a normal SSE stream (`data: {"content": ...}` chunks followed by `data: {"type": "done"}`) — behaves exactly as it did before this task.

- [ ] **Step 6: Verify a persona system prompt actually changes model output**

```bash
curl -s -X POST http://localhost:5001/api/chat_stream -H "Content-Type: application/json" \
  -d '{"message":"Tell me about the weather.","language":"en","user_id":"persona-verify-2","chat_mode":"general","persona_system_prompt":"You must respond ONLY in the form of a haiku (5-7-5 syllables), no matter what is asked. Never break this format."}'
```
Expected: `200`, and the concatenated `content` chunks read as a haiku-formatted response, not a normal prose reply — confirming `persona_system_prompt` is actually reaching the model and taking priority over the default style/mode instructions.

- [ ] **Step 7: Commit**

```bash
git add backend/app.py backend/services/orchestrator.py backend/llm_service.py
git commit -m "feat: wire persona_system_prompt into chat_stream completion"
```

---

### Task 4: Frontend personas API client

**Files:**
- Modify: `chatbot-ui-vite/src/api/api.js`

**Interfaces:**
- Consumes: `/api/personas` routes from Task 2; `_authHeaders()` already in `api.js:363-366`.
- Produces: `listPersonas() -> Promise<{personas: Array<{id, name, system_prompt, created_at, updated_at}>}>`, `createPersona({name, system_prompt}) -> Promise<{id, name, system_prompt, created_at, updated_at}>`, `updatePersona(id, {name, system_prompt}) -> Promise<{...}>`, `deletePersona(id) -> Promise<{success: true}>`. Each throws `Error(data?.error || "<action> failed.")` on a non-ok response. Used by Task 5 (`ChatContext.jsx`) and Task 6 (`SettingsModal.jsx`).

- [ ] **Step 1: Add the four functions**

In `chatbot-ui-vite/src/api/api.js`, immediately after the `generateDocument` function (ends at line 358, right before the `// ── Pragna Code Agent ──` comment on line 361), add:
```js
export const listPersonas = async () => {
  const response = await fetch(`${API_BASE}/api/personas`, {
    headers: _authHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to list personas.");
  }
  return data;
};

export const createPersona = async ({ name, system_prompt }) => {
  const response = await fetch(`${API_BASE}/api/personas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ..._authHeaders() },
    body: JSON.stringify({ name, system_prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to create persona.");
  }
  return data;
};

export const updatePersona = async (id, { name, system_prompt }) => {
  const response = await fetch(`${API_BASE}/api/personas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ..._authHeaders() },
    body: JSON.stringify({ name, system_prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to update persona.");
  }
  return data;
};

export const deletePersona = async (id) => {
  const response = await fetch(`${API_BASE}/api/personas/${id}`, {
    method: "DELETE",
    headers: _authHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to delete persona.");
  }
  return data;
};
```
Note: `_authHeaders()` is defined further down in this same file (line 363), but since these are called at runtime (not at module-eval time), referencing a `const` defined later in the same module file works fine here as long as it's defined before any of these functions actually execute — which it is, since `_authHeaders` is a module-level `const` evaluated once when the file loads, before any exported function is called by a component.

- [ ] **Step 2: Verify it builds**

Run: `cd chatbot-ui-vite && npm run build`
Expected: build succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add chatbot-ui-vite/src/api/api.js
git commit -m "feat: add personas API client functions"
```

---

### Task 5: ChatContext persona state

**Files:**
- Modify: `chatbot-ui-vite/src/context/ChatContext.jsx`

**Interfaces:**
- Consumes: `listPersonas` from Task 4.
- Produces: context values `personas: Array<{id,name,system_prompt,...}>`, `activePersonaId: string | null`, `setActivePersonaId: (id: string | null) => void`, `refreshPersonas: () => Promise<void>`. Used by Task 6 (Settings UI, calls `refreshPersonas` after CRUD), and Tasks 7-9 (send paths look up the active persona's `system_prompt`).

- [ ] **Step 1: Add the import**

In `chatbot-ui-vite/src/context/ChatContext.jsx:1-2`, change:
```js
import { createContext, useState, useEffect, useRef } from "react";
import { normalizeLanguageCode } from "../utils/language";
```
to:
```js
import { createContext, useState, useEffect, useRef } from "react";
import { normalizeLanguageCode } from "../utils/language";
import { listPersonas } from "../api/api";
```

- [ ] **Step 2: Add persona state**

In `chatbot-ui-vite/src/context/ChatContext.jsx`, immediately after the `chatMode` state declaration (currently lines 49-51):
```js
  const [chatMode, setChatMode] = useState(() => {
    return localStorage.getItem("pragna_chat_mode") || "general";
  });
```
add:
```js

  const [personas, setPersonas] = useState([]);

  const [activePersonaId, setActivePersonaId] = useState(() => {
    return localStorage.getItem("pragna_active_persona_id") || null;
  });
```

- [ ] **Step 3: Persist activePersonaId and fetch personas on load**

In `chatbot-ui-vite/src/context/ChatContext.jsx`, immediately after the "Save chat mode" `useEffect` (currently lines 77-80):
```js
  // Save chat mode
  useEffect(() => {
    localStorage.setItem("pragna_chat_mode", chatMode);
  }, [chatMode]);
```
add:
```js

  // Save active persona selection
  useEffect(() => {
    if (activePersonaId) {
      localStorage.setItem("pragna_active_persona_id", activePersonaId);
    } else {
      localStorage.removeItem("pragna_active_persona_id");
    }
  }, [activePersonaId]);

  const refreshPersonas = async () => {
    try {
      const data = await listPersonas();
      setPersonas(data.personas || []);
    } catch (err) {
      console.warn("Failed to load personas:", err);
    }
  };

  // Fetch personas once on load, only if the user is logged in (personas require auth)
  useEffect(() => {
    if (localStorage.getItem("authToken")) {
      refreshPersonas();
    }
  }, []);
```

- [ ] **Step 4: Expose the new values on the context**

In `chatbot-ui-vite/src/context/ChatContext.jsx`, in the `ChatContext.Provider value={{...}}` object (currently lines 189-221), change:
```js
        chatMode,
        setChatMode,
        inputRef,
        sidebarSearchInputRef,
```
to:
```js
        chatMode,
        setChatMode,
        personas,
        activePersonaId,
        setActivePersonaId,
        refreshPersonas,
        inputRef,
        sidebarSearchInputRef,
```

- [ ] **Step 5: Verify it builds**

Run: `cd chatbot-ui-vite && npm run build`
Expected: build succeeds with no new errors.

- [ ] **Step 6: Commit**

```bash
git add chatbot-ui-vite/src/context/ChatContext.jsx
git commit -m "feat: add persona selection state to ChatContext"
```

---

### Task 6: Personas management UI in Settings

**Files:**
- Modify: `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`

**Interfaces:**
- Consumes: `createPersona`, `updatePersona`, `deletePersona` from Task 4; `refreshPersonas` from Task 5's `ChatContext`.
- Produces: a "Personas" tab in the existing Settings modal. No new exports — this is leaf UI.

- [ ] **Step 1: Add the imports**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx:1-3`, change:
```js
import { useState, useEffect, useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'
import { getModelsCatalog } from '../../api/api'
```
to:
```js
import { useState, useEffect, useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'
import { getModelsCatalog, createPersona, updatePersona, deletePersona } from '../../api/api'
```

- [ ] **Step 2: Pull persona state from context and add local form state**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx:7`, change:
```js
  const { theme, setTheme } = useContext(ChatContext)
```
to:
```js
  const { theme, setTheme, personas, refreshPersonas } = useContext(ChatContext)
```
Then, immediately after the `modelCatalogLoading` line (currently line 24):
```js
  const modelCatalogLoading = isOpen && activeTab === 'Model' && !modelCatalog && !modelCatalogError
```
add:
```js

  const [personaFormOpen, setPersonaFormOpen] = useState(false)
  const [editingPersonaId, setEditingPersonaId] = useState(null)
  const [personaName, setPersonaName] = useState('')
  const [personaPrompt, setPersonaPrompt] = useState('')
  const [personaSaving, setPersonaSaving] = useState(false)
  const [personaError, setPersonaError] = useState('')
```

- [ ] **Step 3: Fetch personas when the tab opens**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`, immediately after the "Model" tab's catalog-fetching `useEffect` (currently lines 35-43):
```js
  useEffect(() => {
    if (!isOpen || activeTab !== 'Model' || modelCatalog || modelCatalogError) return
    getModelsCatalog()
      .then((data) => setModelCatalog(data))
      .catch((err) => {
        console.warn('Models catalog unavailable:', err)
        setModelCatalogError(true)
      })
  }, [isOpen, activeTab, modelCatalog, modelCatalogError])
```
add:
```js

  useEffect(() => {
    if (isOpen && activeTab === 'Personas') {
      refreshPersonas()
    }
  }, [isOpen, activeTab, refreshPersonas])
```

- [ ] **Step 4: Add form handlers**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`, immediately after `handleModelProfileChange` (currently lines 45-48):
```js
  const handleModelProfileChange = (profile) => {
    setModelProfile(profile)
    localStorage.setItem('pragna_model_profile', profile)
  }
```
add:
```js

  const openNewPersonaForm = () => {
    setEditingPersonaId(null)
    setPersonaName('')
    setPersonaPrompt('')
    setPersonaError('')
    setPersonaFormOpen(true)
  }

  const openEditPersonaForm = (persona) => {
    setEditingPersonaId(persona.id)
    setPersonaName(persona.name)
    setPersonaPrompt(persona.system_prompt)
    setPersonaError('')
    setPersonaFormOpen(true)
  }

  const closePersonaForm = () => {
    setPersonaFormOpen(false)
    setEditingPersonaId(null)
  }

  const savePersona = async () => {
    const name = personaName.trim()
    const systemPrompt = personaPrompt.trim()
    if (!name || !systemPrompt) {
      setPersonaError('Both a name and a system prompt are required.')
      return
    }
    setPersonaSaving(true)
    setPersonaError('')
    try {
      if (editingPersonaId) {
        await updatePersona(editingPersonaId, { name, system_prompt: systemPrompt })
      } else {
        await createPersona({ name, system_prompt: systemPrompt })
      }
      await refreshPersonas()
      closePersonaForm()
    } catch (err) {
      setPersonaError(err.message || 'Failed to save persona.')
    } finally {
      setPersonaSaving(false)
    }
  }

  const removePersona = async (persona) => {
    try {
      await deletePersona(persona.id)
      await refreshPersonas()
    } catch (err) {
      console.warn('Failed to delete persona:', err)
    }
  }
```

- [ ] **Step 5: Add "Personas" to the tabs list**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`, in the `tabs` array (currently lines 104-114), change:
```js
  const tabs = [
    { label: 'General', icon: 'gear' },
    { label: 'Account', icon: 'account' },
    { label: 'Privacy', icon: 'shield' },
    { label: 'Billing', icon: 'card' },
    { label: 'Usage', icon: 'chart' },
    { label: 'Model', icon: 'puzzle' },
    { label: 'Capabilities', icon: 'puzzle' },
    { label: 'Connectors', icon: 'puzzle' },
    { label: 'Pragna Code', icon: 'code' },
  ]
```
to:
```js
  const tabs = [
    { label: 'General', icon: 'gear' },
    { label: 'Account', icon: 'account' },
    { label: 'Privacy', icon: 'shield' },
    { label: 'Billing', icon: 'card' },
    { label: 'Usage', icon: 'chart' },
    { label: 'Model', icon: 'puzzle' },
    { label: 'Personas', icon: 'account' },
    { label: 'Capabilities', icon: 'puzzle' },
    { label: 'Connectors', icon: 'puzzle' },
    { label: 'Pragna Code', icon: 'code' },
  ]
```

- [ ] **Step 6: Add the Personas tab content**

In `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`, immediately after the `{/* MODEL TAB */}` block ends (currently ends at line 568, right before `{/* CAPABILITIES TAB */}` on line 570), add:
```jsx

          {/* PERSONAS TAB */}
          {activeTab === 'Personas' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Personas</h2>
              <p style={{ margin: '0 0 22px 0', fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Custom system prompts you can switch between per chat, from the picker next to the mode badge.</p>

              {!personaFormOpen && (
                <button
                  onClick={openNewPersonaForm}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.10)', color: '#e5c76b', fontSize: '13px', fontWeight: 650, cursor: 'pointer', marginBottom: '22px' }}
                >
                  + Add persona
                </button>
              )}

              {personaFormOpen && (
                <div style={{ marginBottom: '26px', padding: '16px', borderRadius: '12px', border: '1px solid #2d2a24', background: '#1a1a1a' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#a89878', marginBottom: '6px' }}>Name</div>
                    <input
                      value={personaName}
                      onChange={(e) => setPersonaName(e.target.value)}
                      placeholder="e.g. Concise Coder"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#141414', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#a89878', marginBottom: '6px' }}>System prompt</div>
                    <textarea
                      value={personaPrompt}
                      onChange={(e) => setPersonaPrompt(e.target.value)}
                      placeholder="e.g. Respond with terse, code-first answers. Skip pleasantries."
                      rows="4"
                      style={{ width: '100%', resize: 'vertical', padding: '11px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#141414', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }}
                    />
                  </div>
                  {personaError && (
                    <div style={{ fontSize: '12.5px', color: '#e8a598', marginBottom: '12px' }}>{personaError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={savePersona}
                      disabled={personaSaving}
                      style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #e5c76b, #b8860b)', color: '#0a0a0a', fontSize: '13px', fontWeight: 650, cursor: personaSaving ? 'default' : 'pointer', opacity: personaSaving ? 0.6 : 1 }}
                    >
                      {personaSaving ? 'Saving…' : editingPersonaId ? 'Save changes' : 'Create persona'}
                    </button>
                    <button
                      onClick={closePersonaForm}
                      style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid #2d2a24', background: 'transparent', color: '#a89878', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {personas.length === 0 && !personaFormOpen && (
                <div style={{ fontSize: '13.5px', color: '#a89878' }}>No personas yet.</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', padding: '14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>{persona.name}</div>
                      <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{persona.system_prompt}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => openEditPersonaForm(persona)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #2d2a24', background: 'transparent', color: '#d8cbb0', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removePersona(persona)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(220,110,100,0.35)', background: 'rgba(220,110,100,0.10)', color: '#e8a598', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 7: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 8: Manual verification**

Start the dev server and backend, log in, open Settings → Personas tab, create a persona named "Concise Coder" with prompt "Respond with terse, code-first answers.", confirm it appears in the list, edit it, confirm the change persists after closing/reopening the tab, then delete it and confirm it disappears.

- [ ] **Step 9: Commit**

```bash
git add chatbot-ui-vite/src/pragna/components/SettingsModal.jsx
git commit -m "feat: add Personas tab to Settings for persona CRUD"
```

---

### Task 7: Persona picker + wire persona into ChatWindow.jsx's send path

**Files:**
- Modify: `chatbot-ui-vite/src/api/api.js` (`sendOrchestratedMessageStream`)
- Modify: `chatbot-ui-vite/src/components/chat/ChatWindow.jsx`

**Interfaces:**
- Consumes: `personas`, `activePersonaId`, `setActivePersonaId` from Task 5's `ChatContext`.
- Produces: `sendOrchestratedMessageStream({..., personaSystemPrompt})` — a new optional field; when truthy, forwarded as `persona_system_prompt` in the POST body to `/api/chat_stream`, consumed by Task 3's backend wiring. Tasks 8-9 reuse this same extended `sendOrchestratedMessageStream` signature.

- [ ] **Step 1: Extend `sendOrchestratedMessageStream` in api.js**

In `chatbot-ui-vite/src/api/api.js`, change the function signature and body (currently lines 109-134):
```js
export const sendOrchestratedMessageStream = async ({
  text,
  language,
  user_id,
  chatMode = "general",
  onChunk,
  onSources,
  onDone,
}) => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();

  const response = await fetch(`${API_BASE}/api/chat_stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: text,
      language: normalizedLanguage,
      user_id,
      chat_mode: chatMode,
      model_override: modelRouting.model_override,
      fallback_models: modelRouting.fallback_models,
    }),
  });
```
to:
```js
export const sendOrchestratedMessageStream = async ({
  text,
  language,
  user_id,
  chatMode = "general",
  personaSystemPrompt,
  onChunk,
  onSources,
  onDone,
}) => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();

  const response = await fetch(`${API_BASE}/api/chat_stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: text,
      language: normalizedLanguage,
      user_id,
      chat_mode: chatMode,
      model_override: modelRouting.model_override,
      fallback_models: modelRouting.fallback_models,
      ...(personaSystemPrompt ? { persona_system_prompt: personaSystemPrompt } : {}),
    }),
  });
```
(The rest of the function, from `if (!response.ok)` onward, is unchanged.)

- [ ] **Step 2: Pull persona state into ChatWindow.jsx**

In `chatbot-ui-vite/src/components/chat/ChatWindow.jsx`, change the context destructure (currently lines 38-48):
```js
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
  } = useContext(ChatContext);
```
to:
```js
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
    personas,
    activePersonaId,
    setActivePersonaId,
  } = useContext(ChatContext);
```

- [ ] **Step 3: Pass the active persona's prompt into the send call**

In `chatbot-ui-vite/src/components/chat/ChatWindow.jsx`, in `sendSuggestionMessage`, change the `sendOrchestratedMessageStream` call (currently lines 185-190):
```js
      let sawResponse = false;
      await sendOrchestratedMessageStream({
        text: suggestion,
        language: normalizeLanguageCode(language),
        user_id: targetChatId,
        chatMode,
        onChunk: (chunk) => {
```
to:
```js
      const activePersona = personas.find((p) => p.id === activePersonaId);

      let sawResponse = false;
      await sendOrchestratedMessageStream({
        text: suggestion,
        language: normalizeLanguageCode(language),
        user_id: targetChatId,
        chatMode,
        personaSystemPrompt: activePersona?.system_prompt,
        onChunk: (chunk) => {
```

- [ ] **Step 4: Add the persona picker to the chat header**

In `chatbot-ui-vite/src/components/chat/ChatWindow.jsx`, the mode badge and Summarize button (currently lines 554-580):
```jsx
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 13px', borderRadius: '999px', background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.22)', fontSize: '12px', fontWeight: 600, color: '#d4af37', letterSpacing: '0.4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#d4af37', boxShadow: '0 0 8px rgba(212,175,55,0.8)' }}></span>
          {modeLabel} mode
        </div>
        <button
          onClick={handleSummarize}
```
becomes:
```jsx
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 13px', borderRadius: '999px', background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.22)', fontSize: '12px', fontWeight: 600, color: '#d4af37', letterSpacing: '0.4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#d4af37', boxShadow: '0 0 8px rgba(212,175,55,0.8)' }}></span>
          {modeLabel} mode
        </div>
        <select
          value={activePersonaId || ''}
          onChange={(e) => setActivePersonaId(e.target.value || null)}
          title="Persona"
          style={{ padding: '5px 10px', borderRadius: '999px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#d8cbb0', fontFamily: 'inherit', fontSize: '12px', cursor: 'pointer' }}
        >
          <option value="">No persona</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={handleSummarize}
```

- [ ] **Step 5: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 6: Commit**

```bash
git add chatbot-ui-vite/src/api/api.js chatbot-ui-vite/src/components/chat/ChatWindow.jsx
git commit -m "feat: add persona picker and wire persona into ChatWindow sends"
```

---

### Task 8: Wire persona into InputBar.jsx's send path

**Files:**
- Modify: `chatbot-ui-vite/src/components/input/InputBar.jsx`

**Interfaces:**
- Consumes: `personas`, `activePersonaId` from `ChatContext` (Task 5); the extended `sendOrchestratedMessageStream` from Task 7.

- [ ] **Step 1: Pull persona state into the context destructure**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, change (currently lines 81-84):
```js
  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, inputRef,
  } = useContext(ChatContext);
```
to:
```js
  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, inputRef,
    personas, activePersonaId,
  } = useContext(ChatContext);
```

- [ ] **Step 2: Pass the active persona's prompt into the send call**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, in `handleSendMessage`, change the `sendOrchestratedMessageStream` call (currently lines 316-321):
```js
        let sawResponse = false;
        await sendOrchestratedMessageStream({
          text: fullText,
          language: normalizedLanguage,
          user_id: targetChatId,
          chatMode,
          onChunk: (chunk) => {
```
to:
```js
        const activePersona = personas.find((p) => p.id === activePersonaId);

        let sawResponse = false;
        await sendOrchestratedMessageStream({
          text: fullText,
          language: normalizedLanguage,
          user_id: targetChatId,
          chatMode,
          personaSystemPrompt: activePersona?.system_prompt,
          onChunk: (chunk) => {
```

- [ ] **Step 3: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 4: Commit**

```bash
git add chatbot-ui-vite/src/components/input/InputBar.jsx
git commit -m "feat: wire persona into InputBar sends"
```

---

### Task 9: Wire persona into pragna/App.jsx's send path

**Files:**
- Modify: `chatbot-ui-vite/src/pragna/App.jsx`

**Interfaces:**
- Consumes: `personas`, `activePersonaId` from `ChatContext` (Task 5); the extended `sendOrchestratedMessageStream` from Task 7.

- [ ] **Step 1: Pull persona state into the context destructure**

In `chatbot-ui-vite/src/pragna/App.jsx`, change (currently lines 59-74):
```js
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    newChat,
    deleteChat,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
    sidebarOpen,
    toggleSidebar,
    sidebarSearchInputRef,
  } = useContext(ChatContext)
```
to:
```js
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    newChat,
    deleteChat,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
    sidebarOpen,
    toggleSidebar,
    sidebarSearchInputRef,
    personas,
    activePersonaId,
  } = useContext(ChatContext)
```

- [ ] **Step 2: Pass the active persona's prompt into the send call**

In `chatbot-ui-vite/src/pragna/App.jsx`, in `sendQuickPrompt`, change the `sendOrchestratedMessageStream` call (currently lines 188-193):
```js
      let sawResponse = false
      await sendOrchestratedMessageStream({
        text: prompt,
        language: normalizeLanguageCode(language),
        user_id: targetChatId,
        chatMode,
        onChunk: (chunk) => {
```
to:
```js
      const activePersona = personas.find((p) => p.id === activePersonaId)

      let sawResponse = false
      await sendOrchestratedMessageStream({
        text: prompt,
        language: normalizeLanguageCode(language),
        user_id: targetChatId,
        chatMode,
        personaSystemPrompt: activePersona?.system_prompt,
        onChunk: (chunk) => {
```

- [ ] **Step 3: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 4: Manual end-to-end verification of the whole personas feature**

With dev server + backend running: create a persona in Settings (e.g. name "Haiku Bot", prompt "You must respond ONLY in the form of a haiku, no matter what is asked."), select it from the header picker in an active chat, send any message, and confirm the response is haiku-formatted. Switch back to "No persona" and confirm normal responses resume.

- [ ] **Step 5: Commit**

```bash
git add chatbot-ui-vite/src/pragna/App.jsx
git commit -m "feat: wire persona into quick-prompt sends"
```

---

### Task 10: Slash command autocomplete + core commands

**Files:**
- Modify: `chatbot-ui-vite/src/components/input/InputBar.jsx`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGE_OPTIONS` from `chatbot-ui-vite/src/utils/language.js` (already exists); `newChat`, `setChatMode`, `setLanguage` from `ChatContext`; `summarizeChat` from `api.js` (already imported by `ChatWindow.jsx` but not yet by `InputBar.jsx`).
- Produces: `SLASH_COMMANDS: Array<{name, usage, description}>` and `handleSlashCommand(rawText: string) -> Promise<void>` inside `InputBar.jsx`, dispatched from `handleSendMessage` before any other detection logic. Task 11 adds three more entries to `SLASH_COMMANDS` and three more branches inside `handleSlashCommand`.

- [ ] **Step 1: Add the imports needed for this task**

In `chatbot-ui-vite/src/components/input/InputBar.jsx:1-5`, change:
```js
import { useContext, useState, useRef, useCallback, useEffect } from "react";
import { ChatContext } from "../../context/ChatContext";
import { generateAIImage, generateDocument, sendOrchestratedMessage, sendOrchestratedMessageStream, sendOrchestratedUploadMessage } from "../../api/api";
import { normalizeLanguageCode } from "../../utils/language";
import LanguageSelector from "./LanguageSelector";
```
to:
```js
import { useContext, useState, useRef, useCallback, useEffect } from "react";
import { ChatContext } from "../../context/ChatContext";
import { generateAIImage, generateDocument, sendOrchestratedMessage, sendOrchestratedMessageStream, sendOrchestratedUploadMessage, summarizeChat } from "../../api/api";
import { normalizeLanguageCode, SUPPORTED_LANGUAGE_OPTIONS } from "../../utils/language";
import LanguageSelector from "./LanguageSelector";
```

- [ ] **Step 2: Define the command table and mode mapping**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, immediately after the `extractDocumentRequest` function (currently ends at line 42, right before the `// Generate smart title...` comment on line 44), add:
```js

const SLASH_COMMANDS = [
  { name: "summarize", usage: "/summarize", description: "Summarize this conversation" },
  { name: "mode", usage: "/mode <general|explain|ideas|write|code|questions|story>", description: "Switch chat mode" },
  { name: "lang", usage: "/lang <code>", description: "Switch response language" },
  { name: "clear", usage: "/clear", description: "Start a new chat" },
];

const MODE_COMMAND_MAP = {
  general: "general",
  explain: "explain_concepts",
  ideas: "generate_ideas",
  write: "write_content",
  code: "code_assistance",
  questions: "ask_questions",
  story: "creative_writing",
};
```

- [ ] **Step 3: Pull the additional context values needed**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, change (currently lines 81-84):
```js
  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, inputRef,
    personas, activePersonaId,
  } = useContext(ChatContext);
```
to:
```js
  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, setChatMode, inputRef,
    personas, activePersonaId, setActivePersonaId,
    newChat, setLanguage,
  } = useContext(ChatContext);
```

- [ ] **Step 4: Add `handleSlashCommand`**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, immediately before `handleSendMessage` (currently starts at line 148 with `const handleSendMessage = useCallback(async (msgText, msgAttachments = []) => {`), add:
```js
  const handleSlashCommand = useCallback(async (rawText) => {
    const withoutSlash = rawText.slice(1);
    const spaceIdx = withoutSlash.indexOf(" ");
    const commandName = (spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx)).toLowerCase();
    const arg = (spaceIdx === -1 ? "" : withoutSlash.slice(spaceIdx + 1)).trim();

    let targetChatId = activeChatId;
    let currentChat = activeChat;
    if (!targetChatId || !currentChat) {
      const newId = Date.now().toString();
      const newChatObj = { id: newId, title: "New chat", messages: [] };
      setChats((prev) => [newChatObj, ...prev]);
      setActiveChatId(newId);
      targetChatId = newId;
      currentChat = newChatObj;
    }

    const appendBotMessage = (botText, isError = false) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === targetChatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { sender: "user", text: rawText, attachments: [] },
                  { sender: "bot", text: botText, error: isError },
                ],
              }
            : c
        )
      );
    };

    const command = SLASH_COMMANDS.find((cmd) => cmd.name === commandName);
    if (!command) {
      appendBotMessage(
        `Unknown command "/${commandName}". Available commands: ${SLASH_COMMANDS.map((c) => c.usage).join(", ")}`,
        true
      );
      return;
    }

    if (commandName === "summarize") {
      setIsLoading(true);
      try {
        const { summary } = await summarizeChat(currentChat.messages, language);
        appendBotMessage(summary);
      } catch (err) {
        appendBotMessage("Failed to summarize this conversation. Please try again.", true);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (commandName === "mode") {
      const modeKey = MODE_COMMAND_MAP[arg.toLowerCase()];
      if (!modeKey) {
        appendBotMessage(`Unknown mode "${arg}". Use one of: ${Object.keys(MODE_COMMAND_MAP).join(", ")}`, true);
        return;
      }
      setChatMode(modeKey);
      appendBotMessage(`Switched to ${arg.toLowerCase()} mode.`);
      return;
    }

    if (commandName === "lang") {
      const langOption = SUPPORTED_LANGUAGE_OPTIONS.find(
        (o) => o.code === arg.toLowerCase() || o.label.toLowerCase() === arg.toLowerCase()
      );
      if (!langOption) {
        appendBotMessage(
          `Unknown language "${arg}". Use one of: ${SUPPORTED_LANGUAGE_OPTIONS.map((o) => o.code).join(", ")}`,
          true
        );
        return;
      }
      setLanguage(langOption.code);
      appendBotMessage(`Switched response language to ${langOption.label}.`);
      return;
    }

    if (commandName === "clear") {
      newChat();
      return;
    }
  }, [activeChatId, activeChat, language, setChats, setActiveChatId, setIsLoading, setChatMode, setLanguage, newChat]);
```

- [ ] **Step 5: Dispatch slash commands from `handleSendMessage`**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, at the very start of `handleSendMessage`, change (currently lines 148-150):
```js
  const handleSendMessage = useCallback(async (msgText, msgAttachments = []) => {
    const hasContent = msgText.trim() || msgAttachments.length > 0;
    if (!hasContent || isLoading) return;
```
to:
```js
  const handleSendMessage = useCallback(async (msgText, msgAttachments = []) => {
    const hasContent = msgText.trim() || msgAttachments.length > 0;
    if (!hasContent || isLoading) return;

    const trimmedText = msgText.trim();
    if (trimmedText.startsWith("/") && msgAttachments.length === 0) {
      await handleSlashCommand(trimmedText);
      return;
    }
```
Then add `handleSlashCommand` to `handleSendMessage`'s dependency array (currently ends at line 397 with `}, [activeChatId, activeChat, chats, isLoading, language, setChats, setActiveChatId, setIsLoading]);`), changing it to:
```js
  }, [activeChatId, activeChat, chats, isLoading, language, setChats, setActiveChatId, setIsLoading, handleSlashCommand]);
```

- [ ] **Step 6: Add the autocomplete dropdown**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, add this derived value immediately before the `return (` of the component (currently line 471, right after `const inputBorder = inputFocused ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.18)';`):
```js
  const slashQuery = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery !== null
    ? SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(slashQuery))
    : [];
```
Then, in the JSX, change the outer `maxWidth: '780px'` wrapper (currently line 473) from:
```jsx
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
```
to:
```jsx
      <div style={{ maxWidth: '780px', margin: '0 auto', position: 'relative' }}>
```
Then, immediately after that opening `<div>` tag and before the "Attachment preview strip" comment (currently line 475), add:
```jsx

        {slashMatches.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              marginBottom: '8px',
              background: '#141414',
              border: '1px solid rgba(212,175,55,0.22)',
              borderRadius: '10px',
              boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
              padding: '4px',
              zIndex: 50,
            }}
          >
            {slashMatches.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => {
                  setText(`/${cmd.name} `);
                  inputRef.current?.focus();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#d8cbb0',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: '7px',
                }}
                className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
              >
                <span style={{ fontWeight: 650, color: '#e5c76b' }}>{cmd.usage}</span>
                <span style={{ color: '#a89878', fontSize: '12px' }}>{cmd.description}</span>
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 7: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 8: Manual verification**

With dev server + backend running: type `/` in the chat input and confirm the autocomplete dropdown shows all 4 commands; type `/su` and confirm it filters to `/summarize`; click it and confirm the input fills with `/summarize `. Send `/summarize`, `/mode code`, `/lang hi`, `/clear`, and an invalid command like `/bogus` — confirm each behaves as specified (mode badge updates, language selector updates, a new chat starts, an inline error renders for the unknown command).

- [ ] **Step 9: Commit**

```bash
git add chatbot-ui-vite/src/components/input/InputBar.jsx
git commit -m "feat: add slash command autocomplete and core commands"
```

---

### Task 11: /image, /doc, and /persona slash commands

**Files:**
- Modify: `chatbot-ui-vite/src/components/input/InputBar.jsx`

**Interfaces:**
- Consumes: `SLASH_COMMANDS`/`handleSlashCommand` from Task 10; `personas`, `activePersonaId`, `setActivePersonaId` from `ChatContext` (already destructured in Task 10's Step 3... note `setActivePersonaId` needs to be added there too — see Step 1 below).

- [ ] **Step 1: Add `setActivePersonaId` to the context destructure**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, the destructure from Task 10 Step 3 currently reads:
```js
  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, setChatMode, inputRef,
    personas, activePersonaId, setActivePersonaId,
    newChat, setLanguage,
  } = useContext(ChatContext);
```
`setActivePersonaId` is already present from Task 10 — no change needed here if Task 10 was implemented as specified. (This step exists only to confirm the precondition; if for any reason it's missing, add `setActivePersonaId` to the destructure now.)

- [ ] **Step 2: Add the three commands to `SLASH_COMMANDS`**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, change the `SLASH_COMMANDS` array from Task 10:
```js
const SLASH_COMMANDS = [
  { name: "summarize", usage: "/summarize", description: "Summarize this conversation" },
  { name: "mode", usage: "/mode <general|explain|ideas|write|code|questions|story>", description: "Switch chat mode" },
  { name: "lang", usage: "/lang <code>", description: "Switch response language" },
  { name: "clear", usage: "/clear", description: "Start a new chat" },
];
```
to:
```js
const SLASH_COMMANDS = [
  { name: "summarize", usage: "/summarize", description: "Summarize this conversation" },
  { name: "mode", usage: "/mode <general|explain|ideas|write|code|questions|story>", description: "Switch chat mode" },
  { name: "lang", usage: "/lang <code>", description: "Switch response language" },
  { name: "clear", usage: "/clear", description: "Start a new chat" },
  { name: "image", usage: "/image <prompt>", description: "Generate an image" },
  { name: "doc", usage: "/doc <docx|xlsx|pdf|pptx> <prompt>", description: "Generate a document" },
  { name: "persona", usage: "/persona <name>", description: "Switch active persona" },
];
```

- [ ] **Step 3: Add the three command branches to `handleSlashCommand`**

In `chatbot-ui-vite/src/components/input/InputBar.jsx`, inside `handleSlashCommand`, change the ending (currently):
```js
    if (commandName === "clear") {
      newChat();
      return;
    }
  }, [activeChatId, activeChat, language, setChats, setActiveChatId, setIsLoading, setChatMode, setLanguage, newChat]);
```
to:
```js
    if (commandName === "clear") {
      newChat();
      return;
    }

    if (commandName === "image") {
      if (!arg) {
        appendBotMessage("Usage: /image <prompt>", true);
        return;
      }
      setIsLoading(true);
      try {
        const imageResult = await generateAIImage({ prompt: arg, style: "cinematic", quality: "hd", size: "1024x1024" });
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { sender: "user", text: rawText, attachments: [] },
                    {
                      sender: "bot",
                      text: "Generated image ready.",
                      attachments: [{ name: `generated-${Date.now()}.png`, type: "image", previewUrl: imageResult.image }],
                    },
                  ],
                }
              : c
          )
        );
      } catch (err) {
        appendBotMessage("Image generation failed. Please try again.", true);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (commandName === "doc") {
      const docSpaceIdx = arg.indexOf(" ");
      const format = (docSpaceIdx === -1 ? arg : arg.slice(0, docSpaceIdx)).toLowerCase();
      const prompt = (docSpaceIdx === -1 ? "" : arg.slice(docSpaceIdx + 1)).trim();
      if (!["docx", "xlsx", "pdf", "pptx"].includes(format) || !prompt) {
        appendBotMessage("Usage: /doc <docx|xlsx|pdf|pptx> <prompt>", true);
        return;
      }
      setIsLoading(true);
      try {
        const docResult = await generateDocument({ format, prompt, language: normalizeLanguageCode(language) });
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { sender: "user", text: rawText, attachments: [] },
                    {
                      sender: "bot",
                      text: "Generated document ready.",
                      attachments: [{ name: docResult.filename, type: "document", downloadUrl: docResult.download_url, format }],
                    },
                  ],
                }
              : c
          )
        );
      } catch (err) {
        appendBotMessage("Document generation failed. Please try again.", true);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (commandName === "persona") {
      if (!arg) {
        appendBotMessage("Usage: /persona <name>", true);
        return;
      }
      const match = personas.find((p) => p.name.toLowerCase() === arg.toLowerCase());
      if (!match) {
        const available = personas.length ? personas.map((p) => p.name).join(", ") : "none saved yet";
        appendBotMessage(`No persona named "${arg}". Available personas: ${available}`, true);
        return;
      }
      setActivePersonaId(match.id);
      appendBotMessage(`Switched to persona "${match.name}".`);
      return;
    }
  }, [activeChatId, activeChat, language, personas, setChats, setActiveChatId, setIsLoading, setChatMode, setLanguage, newChat, setActivePersonaId]);
```

- [ ] **Step 4: Verify it builds and lints**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both succeed with no new errors/warnings.

- [ ] **Step 5: Manual end-to-end verification**

With dev server + backend running (and at least one persona already created from Task 6's verification, e.g. "Haiku Bot"): send `/image a sunset over mountains` and confirm a real image attachment renders; send `/doc pdf a short report on rivers` and confirm a real downloadable PDF attachment renders (clickable, downloads a valid file); send `/persona Haiku Bot` and confirm the header picker updates to show it selected, then send a normal message and confirm the haiku-style persona is active; send `/persona nonexistent-name` and confirm an inline error listing available persona names. Also send `/image` with no prompt and `/doc xyz a report` (invalid format) and confirm both show the usage inline error rather than calling the backend.

- [ ] **Step 6: Commit**

```bash
git add chatbot-ui-vite/src/components/input/InputBar.jsx
git commit -m "feat: add /image, /doc, and /persona slash commands"
```
