"""Markdown-outline based content generation shared by all document formats
(Word, Excel, PDF, PowerPoint). See docs/superpowers/specs/2026-07-11-ai-document-generation-design.md.
"""
import re

from services.llm import generate_completion

_TABLE_SEPARATOR_RE = re.compile(r'^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$')


def _parse_markdown_outline(text):
    """Parse a markdown outline into {"title": str, "sections": [{"heading", "bullets", "table"}]}.

    A section ends up with either a populated `bullets` list (`table: None`) or a
    populated `table` (`bullets: []`) — never both, even if the source text mixed them.
    """
    title = ""
    sections = []
    current = None

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith('# '):
            title = line[2:].strip()
            continue

        if line.startswith('## '):
            current = {"heading": line[3:].strip(), "bullets": [], "table": []}
            sections.append(current)
            continue

        if current is None:
            continue

        if line.startswith('|'):
            if _TABLE_SEPARATOR_RE.match(line):
                continue
            cells = [c.strip() for c in line.strip('|').split('|')]
            current["table"].append(cells)
            continue

        if line.startswith('- ') or line.startswith('* '):
            current["bullets"].append(line[2:].strip())
            continue

    for section in sections:
        if section["table"]:
            section["bullets"] = []
        else:
            section["table"] = None

    return {"title": title or "Untitled Document", "sections": sections}


def generate_document_structure(prompt, language="en"):
    """Ask the LLM for a markdown outline about `prompt` and parse it into a document structure."""
    system_prompt = (
        "You write structured outlines for documents. Given a subject, respond ONLY with "
        "a markdown outline in this exact shape:\n"
        "# <Title>\n"
        "## <Section heading>\n"
        "- <bullet point>\n"
        "- <bullet point>\n"
        "## <Another section heading>\n"
        "| <column> | <column> |\n"
        "| <value> | <value> |\n\n"
        "Use bullet points for narrative sections and a markdown table only for sections "
        "that are genuinely tabular data. Include 3-6 sections. Do not include any text "
        "outside the outline."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    outline_text = generate_completion(messages, language=language)
    return _parse_markdown_outline(outline_text)
