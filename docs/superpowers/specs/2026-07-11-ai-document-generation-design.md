# AI Document Generation (Word, Excel, PDF, PowerPoint)

**Status:** Approved

## Goal

Let a user ask Pragna, in plain chat language, to generate a downloadable document — a Word doc, Excel spreadsheet, PDF, or PowerPoint deck — and get a real, working file back as a chat attachment, the same way image generation already works today.

## Context (existing patterns this builds on)

- Image generation (`chatbot-ui-vite/src/components/chat/ChatWindow.jsx`, `InputBar.jsx`, `pragna/App.jsx`) already follows the exact shape this feature needs: a regex (`IMAGE_REQUEST_RE`) detects the phrase, a helper (`extractImagePrompt`) pulls out the subject, and a dedicated API call (`generateAIImage`) hits a backend endpoint and returns a result that gets attached to the bot message instead of normal chat text.
- `backend/requirements.txt` already includes `python-docx>=1.1.2` and `openpyxl>=3.1.5` (currently used only for *parsing* uploaded files, per `backend/app.py`'s upload-analysis route — not for generating new files). `python-pptx` and `reportlab` are not yet dependencies and need to be added for PowerPoint and PDF generation respectively.
- `backend/app.py`'s `/api/summarize_chat` (already shipped) establishes the pattern for a one-shot LLM call via `services/llm.py`'s `generate_completion(messages, language=...)` — this feature's content-generation call reuses that same function.
- `MessageBubble.jsx`'s `renderAttachments` (`chatbot-ui-vite/src/components/chat/MessageBubble.jsx:284-321`) currently renders file/video attachments as decorative, non-interactive boxes (icon + name, no click behavior) — only image attachments are clickable. This feature adds a new attachment type that must actually be downloadable.

## Architecture

One backend endpoint accepts a target format and a prompt, asks the LLM for a structured Markdown outline, parses that outline into a shared in-memory structure, and hands it to one of four format-specific builder functions. The resulting file is saved to a dedicated directory and served through a download route. The frontend detects a document-generation request the same way it already detects an image-generation request, calls the new endpoint, and renders the result as a real downloadable attachment.

## Backend

### Dependencies
Add to `backend/requirements.txt`: `python-pptx` and `reportlab`. `python-docx` and `openpyxl` are already present.

### Content generation
A single prompt template asks the LLM (via `generate_completion`, the same call used by `/api/summarize_chat`) to produce a Markdown outline for the requested subject:
```
# <Title>
## <Section heading>
- <bullet>
- <bullet>
| <col> | <col> |
| <val> | <val> |
## <Next section heading>
...
```
A parser (`_parse_markdown_outline(text)`) turns this into: `{ "title": str, "sections": [{ "heading": str, "bullets": [str, ...], "table": [[str, ...], ...] | None }, ...] }`. A section has either bullets or a table (whichever the LLM produced for that section), never both.

### Format builders
All four consume the identical parsed structure:
- **`_build_docx(structure)`** — title as a Word title style, each section heading as a Heading 1/2, bullets as bulleted paragraphs, tables as real `docx` tables.
- **`_build_pdf(structure)`** — same shape via ReportLab `Paragraph`/`ListFlowable`/`Table` flowables.
- **`_build_pptx(structure)`** — a title slide from `title`, then one content slide per section: heading as the slide title, bullets as the slide's bullet placeholder (a section with a table instead renders its rows as plain text lines on the slide, since native pptx tables are more complex to lay out well from arbitrary data — acceptable for a first version).
- **`_build_xlsx(structure)`** — if any section has a table, write it to a worksheet named after that section's heading (first table found if there are several); if no section has a table (a prose-style request routed to Excel), fall back to a two-column "Section" / "Content" sheet built from the sections' headings and bullets, so the output is never an empty spreadsheet.

### Routes
- **`POST /api/documents/generate`** — body `{"format": "docx"|"xlsx"|"pdf"|"pptx", "prompt": str, "language": "en"}`. Generates content, builds the file, saves it under a dedicated `backend/generated_docs/` directory with a unique filename (timestamp + sanitized subject + correct extension), and returns `{"download_url": "/api/documents/download/<filename>", "filename": "<display name>"}`.
- **`GET /api/documents/download/<filename>`** — validates `filename` contains no path-traversal characters and exists under `backend/generated_docs/`, then serves it via Flask's `send_from_directory` with `as_attachment=True` so it downloads with the correct name and MIME type.

## Frontend

### Detection
A new `DOCUMENT_REQUEST_RE` (matching phrases like "make/create/write/generate a word doc/document/report/excel sheet/spreadsheet/pdf/powerpoint/presentation/slides (about|on|for) ...") and a paired `extractDocumentRequest(text)` helper that returns `{ format, subject }` — `format` mapped from whichever format keyword matched (word→docx, excel/spreadsheet/sheet→xlsx, pdf→pdf, powerpoint/slides/presentation→pptx). Added alongside the existing `IMAGE_REQUEST_RE` check in all three message-send locations: `ChatWindow.jsx`'s `sendSuggestionMessage`, `InputBar.jsx`'s `handleSendMessage`, and `pragna/App.jsx`'s `sendQuickPrompt`. Checked before the image-request check (document phrases like "write a report" don't overlap with the image regex, so order has no behavioral effect, but keeps detection logic grouped together at the top of each handler).

### API call
New `generateDocument({ format, prompt, language })` in `api.js`, POSTing to `/api/documents/generate`, returning `{ download_url, filename }`.

### Rendering
On success, the bot message is completed with `attachments: [{ type: "document", name: filename, downloadUrl: download_url, format }]` instead of normal streamed text (matching how image generation completes with an image attachment today). `MessageBubble.jsx`'s `renderAttachments` gets a new `type === "document"` branch: a real `<a href={downloadUrl} download={name}>` styled like the existing file-attachment box, with a format-specific icon (Word/Excel/PDF/PowerPoint), that actually downloads the file when clicked — unlike the existing decorative file/video attachment boxes.

## Testing

- **Backend:** direct `curl -X POST /api/documents/generate` for each of the 4 formats with a real subject, confirming a `download_url` is returned and that hitting that URL via `curl -o` downloads a valid, non-empty file of the correct type.
- **Frontend:** `npm run build && npm run lint` (no new errors/warnings versus this repo's pre-existing baseline), plus manual exercise: type a natural-language request for each of the 4 formats, confirm the chat renders a downloadable attachment, and confirm the downloaded file opens correctly and contains sensible content.

## Out of scope

- Editing a previously generated document from chat (each request produces a fresh file).
- Tables rendered as native tables inside PowerPoint slides (rendered as plain text lines instead, per the design above).
- Any new UI for managing/browsing previously generated files — the download link in the chat message is the only access point.
- Automatic cleanup/expiry of files in `backend/generated_docs/` (not addressed in this round).
