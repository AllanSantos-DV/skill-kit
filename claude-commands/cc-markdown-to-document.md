---
name: cc-markdown-to-document
description: "**WORKFLOW SKILL** — Generate formatted documents from Markdown or structured content. USE FOR: creating PowerPoint presentations, Word documents, Excel spreadsheets, MS Project files, PDFs from Markdown/JSON/chat context using templates. DO NOT USE FOR: converting documents TO Markdown (use doc-to-markdown), general file I/O, web scraping."
---
# Markdown to Document — Agent Guide

You are helping a developer generate formatted documents from Markdown content, structured JSON data, or chat context. The output can be PowerPoint, Word, Excel, MS Project (MSPDI), or PDF. Templates are the preferred approach for polished output — ask the user for one before generating from scratch.

## Installation

All generation scripts include dependency checks — if a required package is missing, the script auto-installs it in non-interactive environments (LLM agents, CI). In interactive terminals, the user is prompted for confirmation.

| Format | Package | Install |
|--------|---------|--------|
| PowerPoint (.pptx) | python-pptx | `pip install python-pptx` |
| Word (.docx) | docxtpl | `pip install docxtpl` |
| Excel (.xlsx) | openpyxl | `pip install openpyxl` |
| PDF (.pdf) | xhtml2pdf + markdown | `pip install xhtml2pdf markdown` |
| PDF (.pdf) — optional engines | fpdf2, weasyprint | `pip install fpdf2` / `pip install weasyprint` |
| MS Project (.mspdi) | mpxj | `pip install mpxj` (requires Java 11+) |

#### Quick Install (all dependencies)

```bash
pip install python-pptx docxtpl openpyxl xhtml2pdf markdown fpdf2 mpxj jpype1
```

> **Note:** All generation scripts overwrite existing output files without warning.

### Fallback: Pandoc (universal converter)

Pandoc supports PPTX, DOCX, and PDF generation from Markdown with `--reference-doc` for templates.

```bash
# Windows
choco install pandoc
# Linux
apt install pandoc
# macOS
brew install pandoc
```

## Standalone Scripts

This skill includes ready-to-run Python scripts in the `scripts/` directory.

> **⚠️ IMPORTANT: Treat scripts as black boxes.** Run `python scripts/<script>.py --help` to learn usage. Do **NOT** read the source code of these scripts — it will pollute your context window with implementation details you don't need. The scripts are designed to be used via their CLI interface only.

When the user needs document generation, **execute these directly** via `run_in_terminal` instead of generating code from scratch.

| Script | Purpose | Quick Usage |
|--------|---------|-------------|
| `generate_pptx.py` | JSON/MD → PowerPoint | `python scripts/generate_pptx.py input.json -t template.pptx -o output.pptx` |
| `generate_docx.py` | JSON/MD → Word | `python scripts/generate_docx.py input.json -t template.docx -o output.docx` |
| `generate_xlsx.py` | JSON/MD → Excel | `python scripts/generate_xlsx.py input.json -o output.xlsx` |
| `generate_project.py` | JSON → MSPDI XML | `python scripts/generate_project.py input.json -o output.xml` |
| `generate_pdf.py` | MD/HTML → PDF | `python scripts/generate_pdf.py input.md -o output.pdf --css style.css` |
| `analyze_template.py` | Extract style profile | `python scripts/analyze_template.py input.pptx -o profile.json` (also .docx, .xlsx, .mpp, .mspdi, .mpx, .xml) |
| `runtime_resolver.py` | Check runtime deps | `python scripts/runtime_resolver.py java --min-version 11` |

All scripts accept `--help` for full usage. Paths are passed as parameters — never hardcoded.

> **Working directory:** Run scripts from any directory using absolute paths, or from the skill's root directory using relative paths.

## Format → Tool Mapping

| Format | Extensions | Primary Tool | Fallback | Template Support |
|--------|-----------|-------------|----------|-----------------|
| PowerPoint | .pptx | python-pptx | pandoc `--reference-doc` | Yes — placeholder injection |
| Word | .docx | docxtpl | pandoc `--reference-doc` | Yes — Jinja2 tags |
| Excel | .xlsx | openpyxl | XlsxWriter (from scratch) | Yes — load_workbook |
| PDF | .pdf | xhtml2pdf | fpdf2, WeasyPrint, pandoc | Yes — CSS/HTML templates |
| MS Project | .mspdi (.xml) | MPXJ + Java | — | No — programmatic only |

> **⚠ MS Project trade-off:** The `.mpp` format is proprietary — no open-source library can write it directly. This skill generates **MSPDI XML**, which is the official MS Project interchange format. MS Project opens MSPDI natively with full fidelity (tasks, predecessors, resources, assignments). The user simply opens the `.xml` in Project and can save as `.mpp`. **Always inform the user about this when generating project files.**

## The Template Workflow

This is the core decision flow. Follow it for every document generation request.

```
User request arrives
  │
  ├─ User provides EXAMPLE document (not a template)?
  │   └─ YES → Run analyze_template.py to extract style profile
  │       → Use profile to guide generation (fonts, colors, layouts)
  │       → Ask: "I analyzed your example. Want me to use these patterns?"
  │
  ├─ User provides template file?
  │   ├─ YES → Use template directly
  │   └─ NO → Ask: "Do you have a template (.pptx/.docx/.xlsx) to use as base?"
  │       ├─ YES → User provides path → Use it
  │       └─ NO → Use default generation (no template, clean output)
  │
  ├─ User provides content (MD/JSON)?
  │   ├─ YES → Parse and map to format
  │   └─ NO → Analyze chat context → Structure into JSON intermediate
  │
  └─ Generate document
      ├─ Template path? → Inject content into template
      ├─ Style profile? → Apply extracted patterns to generation
      └─ No template? → Create from scratch with tool defaults
```

### Scenario 1: "Analyze and document"

The user asks to analyze something and produce a document.

1. Perform the requested analysis
2. Structure findings as Markdown or JSON (see Intermediate Representation below)
3. Save intermediate data to a temp JSON file
4. Ask user for template (or proceed without one)
5. Run the appropriate `generate_*.py` script
6. Deliver the generated document

### Scenario 2: "Make a presentation from this chat"

The user asks for a document based on existing chat context.

1. Extract key points from the conversation
2. Structure into the appropriate JSON schema
3. Save to temp JSON file
4. Ask user for template
5. Run the script
6. Deliver

### Scenario 3: "Create using this template"

The user provides a template upfront.

1. Analyze template structure (placeholders, layouts)
2. Gather or generate content to fill placeholders
3. Structure as JSON matching template expectations
4. Run the script with `--template` flag
5. Deliver

### Scenario 4: "Use this existing document as reference"

The user provides an example document and wants new content in the same style.

1. Run `python scripts/analyze_template.py example.pptx` (or .docx / .xlsx / .mpp / .xml)
2. Read the JSON style profile output
3. Use the profile to structure the JSON intermediate:
   - Choose matching slide layouts (most commonly used in the example)
   - Apply font sizes and bullet patterns from the profile
   - Follow the recommendations in the profile output
   - **For MS Project (.mpp/.xml):** Extract WBS structure, resource pool, calendar settings, task duration patterns, and predecessor link types — then generate a new project following the same hierarchy and conventions
4. Generate the new document incorporating those patterns
5. Deliver with a summary of which patterns were applied

> **Tip:** The style profile's `recommendations` field contains ready-to-use guidance. Present these to the user so they can confirm or adjust before generation.

## Intermediate Representation

When Markdown structure isn't sufficient, produce JSON matching these schemas. Save the JSON to a file, then pass it to the generation script.

### PPTX Schema

```json
{
  "slides": [
    {
      "layout": "Title Slide",
      "title": "Presentation Title",
      "body": "Subtitle or description",
      "notes": "Speaker notes for this slide"
    },
    {
      "layout": "Title and Content",
      "title": "Slide Title",
      "body": "- Bullet point 1\n- Bullet point 2\n  - Sub-bullet (level 1)\n    - Deep sub-bullet (level 2)\n- Bullet point 3",
      "notes": "Additional context",
      "image_path": "path/to/image.png"
    }
  ]
}
```

> **Bullet formatting:** Bullet markers (`•`, `-`, `*`) and indentation (2 spaces per level, max level 2) in the `body` field are converted to native PowerPoint bullet formatting with proper paragraph levels. Numbered lists (`1.`, `2.`, etc.) are preserved as text with bullet-level indentation. Lines without markers are rendered as plain paragraphs. Speaker notes are always plain text.

### DOCX Schema

**Without template** (from-scratch generation using built-in structure):

```json
{
  "data": {
    "title": "Document Title",
    "subtitle": "Optional subtitle",
    "author": "Author Name",
    "date": "2026-03-11",
    "sections": [
      {
        "heading": "Section 1",
        "body": "Paragraph text for section 1."
      },
      {
        "heading": "Section 2",
        "body": "Paragraph text for section 2."
      }
    ],
    "items": [
      {"name": "Item 1", "description": "Details about item 1", "status": "Complete"},
      {"name": "Item 2", "description": "Details about item 2", "status": "In Progress"}
    ],
    "summary": "Closing summary paragraph."
  }
}
```

Supported fields: `title`, `subtitle`, `author`, `date`, `sections` (array of `{heading, body}`), `items` (array of objects → rendered as table, or array of strings → rendered as bullet list), `summary`.

**With template** (Jinja2 via docxtpl): Provide fields matching the template's `{{ variable }}` placeholders. Any JSON structure is supported — the data is passed directly to docxtpl's `render()`.

### XLSX Schema

```json
{
  "sheets": {
    "Summary": {
      "headers": ["Metric", "Value", "Change"],
      "rows": [
        ["Revenue", "$1.2M", "+15%"],
        ["Users", "45,000", "+8%"]
      ]
    },
    "Details": {
      "headers": ["Date", "Category", "Amount"],
      "rows": [
        ["2026-01-15", "Sales", "$50,000"],
        ["2026-01-16", "Marketing", "$12,000"]
      ]
    }
  }
}
```

### MSPDI (Project) Schema

```json
{
  "tasks": [
    {
      "name": "Project Planning",
      "start": "2026-04-01",
      "duration": "5d",
      "predecessors": [],
      "resources": ["Project Manager"]
    },
    {
      "name": "Development Phase",
      "start": "2026-04-08",
      "duration": "20d",
      "predecessors": [1],
      "resources": ["Dev Team"]
    }
  ]
}
```

## Runtime Dependency Discovery

Some tools require external runtimes (Java for MPXJ, LibreOffice for PDF via Carbone). Use the `runtime_resolver.py` script to check availability before running generation.

1. Run `python scripts/runtime_resolver.py <runtime> --min-version <ver>`
2. The script checks: env vars → PATH → known OS paths → reports findings
3. If found: proceed normally
4. If not found: tell the user what's needed and how to install it
5. User can provide custom paths via `--extra-paths PATH1 PATH2`
6. Output is JSON — discovered paths can be stored for future use

Example:
```bash
python scripts/runtime_resolver.py java --min-version 11
# → {"found": true, "version": "17.0.2", "path": "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe", ...}
```

## Per-Format Generation Guide

### PowerPoint (.pptx)

**With template:**
1. Prepare JSON matching the PPTX schema
2. Run: `python scripts/generate_pptx.py slides.json -t corporate_template.pptx -o output.pptx`
3. The script opens the template, matches slide layouts by name, and populates placeholders

**Without template:**
1. Prepare JSON or pass Markdown directly
2. Run: `python scripts/generate_pptx.py slides.json -o output.pptx`
3. Creates a blank presentation with default slide layouts

**From Markdown:**
- Headings (`##`) become slide titles
- Bullet lists become slide body content
- Content between headings becomes one slide

**Pandoc fallback:**
```bash
pandoc input.md -o output.pptx --reference-doc=template.pptx
```

### Word (.docx)

**With Jinja2 template:**
1. The template file (.docx) contains Jinja2 tags: `{{ title }}`, `{% for item in items %}`, etc.
2. Prepare JSON matching the template variables
3. Run: `python scripts/generate_docx.py data.json -t report_template.docx -o report.docx`
4. docxtpl renders the template with the JSON data

**Without template:**
1. Pass Markdown or JSON
2. Run: `python scripts/generate_docx.py content.md -o report.docx`
3. Creates a clean document from the Markdown structure

**Pandoc fallback:**
```bash
pandoc input.md -o output.docx --reference-doc=template.docx
```

### Excel (.xlsx)

**With template:**
1. Prepare JSON matching the XLSX schema
2. Run: `python scripts/generate_xlsx.py data.json -t template.xlsx -o output.xlsx`
3. The script opens the template and fills cells starting from specified positions

**Without template:**
1. Run: `python scripts/generate_xlsx.py data.json -o output.xlsx`
2. Creates a new workbook with one sheet per key in the JSON

**Features:** Bold headers, auto-width columns, basic number formatting.

### MS Project (.mspdi)

**Requires Java 11+.** The script checks automatically via `runtime_resolver.py`.

> **Inform the user:** This skill generates MSPDI XML (`.xml`), not `.mpp` directly. The `.mpp` format is proprietary and cannot be written by open-source tools. However, **MS Project imports MSPDI XML natively with full fidelity** — all tasks, durations, predecessors, resources, and assignments are preserved. The user opens the `.xml` in Project and saves as `.mpp` if needed. If the user has MS Project installed and wants direct `.mpp` output, COM Automation (`win32com`) is an alternative path but requires the application installed locally.

1. Prepare JSON matching the MSPDI schema
2. Run: `python scripts/generate_project.py tasks.json -o project.xml`
3. Output is MSPDI XML — open directly in MS Project, Project Professional, or ProjectLibre
4. Save as `.mpp` from within the application if the binary format is needed

If Java is not found, the script prints installation instructions and exits.

### PDF (.pdf)

The script auto-detects the best available engine: **xhtml2pdf** → **fpdf2** → **WeasyPrint**. You can force one with `--engine`.

**Dependencies:**
```bash
pip install xhtml2pdf markdown  # primary engine
pip install fpdf2               # fallback engine (optional)
pip install weasyprint           # tertiary engine (optional, requires GTK3/Pango)
```

**From Markdown:**
1. Run: `python scripts/generate_pdf.py content.md -o output.pdf`
2. Markdown is converted to HTML internally, then rendered to PDF

**With CSS template (xhtml2pdf or WeasyPrint):**
1. Run: `python scripts/generate_pdf.py content.md -o output.pdf --css corporate_style.css`
2. CSS controls fonts, margins, headers/footers, page breaks

**Force a specific engine:**
```bash
python scripts/generate_pdf.py content.md -o output.pdf --engine xhtml2pdf
python scripts/generate_pdf.py content.md -o output.pdf --engine fpdf2
python scripts/generate_pdf.py content.md -o output.pdf --engine weasyprint
```

**Pandoc fallback:**
```bash
pandoc input.md -o output.pdf --pdf-engine=weasyprint --css=style.css
```

## When the User Asks for Help

- **"Create a presentation from this content"** → Structure content into PPTX JSON schema. Ask for template. Run `python scripts/generate_pptx.py`. Verify python-pptx is installed first.

- **"Generate a report as Word document"** → Ask if they have a .docx template with Jinja2 tags. Structure data as JSON. Run `python scripts/generate_docx.py`. Verify docxtpl is installed.

- **"Make a spreadsheet from this data"** → Structure data into XLSX JSON schema (sheets → headers + rows). Run `python scripts/generate_xlsx.py`. Verify openpyxl is installed.

- **"Export this as a project plan"** → Check Java: `python scripts/runtime_resolver.py java --min-version 11`. Structure as MSPDI JSON schema. Run `python scripts/generate_project.py`.

- **"Generate a PDF from this"** → Determine if input is Markdown or HTML. Ask if they have CSS styles. Run `python scripts/generate_pdf.py`. Requires xhtml2pdf or fpdf2 (`pip install xhtml2pdf markdown`).

- **"I have a template I want to use"** → Identify the template format (.pptx/.docx/.xlsx). Analyze what placeholders/variables it expects. Structure content to match. Run the corresponding script with `-t`.

- **"Convert this chat into a document"** → Extract key content from conversation. Ask target format. Structure into appropriate JSON schema. Generate.

## Quick Reference

| I need to... | Format | Tool | Template? |
|---|---|---|---|
| Create a presentation | PPTX | python-pptx | Recommended |
| Write a report | DOCX | docxtpl | Recommended |
| Build a spreadsheet | XLSX | openpyxl | Optional |
| Export a project plan | MSPDI | MPXJ + Java | N/A |
| Generate a PDF | PDF | xhtml2pdf / fpdf2 | CSS optional |
| Quick convert (any) | PPTX/DOCX/PDF | Pandoc | `--reference-doc` |
| Analyze a template | PPTX/DOCX/XLSX/MPP | analyze_template.py | N/A — reads existing docs |

## Common Pitfalls

❌ Generating a PPTX by writing raw XML — use python-pptx, it handles the complexity.
✅ Use `Presentation()` from python-pptx to create or open templates.

❌ Hardcoding slide layout indices — layout names differ between templates.
✅ Match layouts by name: `prs.slide_layouts.get_by_name("Title and Content")` with fallback to index.

❌ Installing MPXJ without checking for Java first.
✅ Always run `runtime_resolver.py java --min-version 11` before using MPXJ.

❌ Using `python-docx` for template rendering — it has no template engine.
✅ Use `docxtpl` which wraps python-docx and adds Jinja2 template support.

❌ Generating PDF from Markdown using raw `markdown` library — styling is minimal.
✅ Use xhtml2pdf (CSS support) or fpdf2 (lightweight) via `generate_pdf.py`. WeasyPrint is optional for best quality but requires GTK3 on Windows.

❌ Passing Markdown with `---` frontmatter to generation scripts — it will be treated as content.
✅ Strip YAML frontmatter before passing to scripts, or use JSON input instead.

❌ Creating Excel files with XlsxWriter when you need to fill a template — XlsxWriter only creates new files.
✅ Use openpyxl's `load_workbook()` to open and modify existing templates.

For detailed tool comparisons, see [tools-reference.md](./references/tools-reference.md).
For code examples by format, see [examples.md](./references/examples.md).
For troubleshooting common issues, see [troubleshooting.md](./references/troubleshooting.md).
For template creation guidance, see [templates-guide.md](./references/templates-guide.md).

## Companion Skills

- For **the reverse direction** (documents → Markdown): use **doc-to-markdown**
- For **understanding intent** before generating documents: use **task-intent**


---

## References

# Examples — Markdown to Document Generation

Practical, copy-paste-ready code examples for each format. All examples use Python.

---

## PowerPoint (.pptx) — With Template

```python
from pptx import Presentation
import json

# Load template and data
prs = Presentation("template.pptx")
with open("slides.json", encoding="utf-8") as f:
    data = json.load(f)

for slide_data in data["slides"]:
    # Match layout by name, fall back to index 1
    layout = None
    for sl in prs.slide_layouts:
        if sl.name == slide_data.get("layout", ""):
            layout = sl
            break
    if layout is None:
        layout = prs.slide_layouts[1]

    slide = prs.slides.add_slide(layout)

    if slide.shapes.title and slide_data.get("title"):
        slide.shapes.title.text = slide_data["title"]

    # Body goes to placeholder index 1 (typically content area)
    if len(slide.placeholders) > 1 and slide_data.get("body"):
        slide.placeholders[1].text = slide_data["body"]

    # Speaker notes
    if slide_data.get("notes"):
        slide.notes_slide.notes_text_frame.text = slide_data["notes"]

prs.save("output.pptx")
print("Generated: output.pptx")
```

---

## PowerPoint (.pptx) — Without Template

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()

# Title slide
title_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_layout)
slide.shapes.title.text = "Quarterly Review"
slide.placeholders[1].text = "Q1 2026 Results"

# Content slides
content_layout = prs.slide_layouts[1]
slides_content = [
    ("Revenue", "- Total: $1.2M\n- Growth: +15%\n- Target: $1.5M"),
    ("Users", "- Active: 45,000\n- New: 5,200\n- Churn: 2.1%"),
]

for title, body in slides_content:
    slide = prs.slides.add_slide(content_layout)
    slide.shapes.title.text = title
    slide.placeholders[1].text = body

prs.save("presentation.pptx")
print("Generated: presentation.pptx")
```

---

## PowerPoint (.pptx) — From Markdown

```python
import re
from pptx import Presentation

md_content = """
## Introduction

Welcome to the quarterly review.

## Key Metrics

- Revenue: $1.2M
- Users: 45,000
- Growth: 15%

## Next Steps

- Expand to new markets
- Improve retention
- Launch v2.0
"""

# Parse Markdown: each ## heading starts a new slide
slides = []
current = None
for line in md_content.strip().split("\n"):
    if line.startswith("## "):
        if current:
            slides.append(current)
        current = {"title": line[3:].strip(), "body": ""}
    elif current is not None:
        current["body"] += line + "\n"
if current:
    slides.append(current)

prs = Presentation()
for s in slides:
    layout = prs.slide_layouts[1]
    slide = prs.slides.add_slide(layout)
    slide.shapes.title.text = s["title"]
    slide.placeholders[1].text = s["body"].strip()

prs.save("from_markdown.pptx")
print("Generated: from_markdown.pptx")
```

---

## Word (.docx) — With Jinja2 Template

```python
from docxtpl import DocxTemplate
import json

# Template (.docx) contains: {{ title }}, {% for item in items %}...{% endfor %}
doc = DocxTemplate("report_template.docx")

with open("data.json", encoding="utf-8") as f:
    context = json.load(f)["data"]

doc.render(context)
doc.save("report.docx")
print("Generated: report.docx")
```

**Example template content in Word:**
```
{{ title }}

Date: {{ date }}
Author: {{ author }}

Summary: {{ summary }}

| Name | Description | Status |
{% for item in items %}
| {{ item.name }} | {{ item.description }} | {{ item.status }} |
{% endfor %}
```

---

## Word (.docx) — Without Template

```python
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_heading("Monthly Report", level=0)
doc.add_paragraph("Date: 2026-03-11")
doc.add_paragraph("Author: Data Team")

doc.add_heading("Executive Summary", level=1)
doc.add_paragraph(
    "This report covers the key metrics for Q1 2026. "
    "Overall performance exceeded expectations."
)

doc.add_heading("Key Metrics", level=1)
table = doc.add_table(rows=1, cols=3)
table.style = "Light Grid Accent 1"
hdr = table.rows[0].cells
hdr[0].text = "Metric"
hdr[1].text = "Value"
hdr[2].text = "Change"

data = [("Revenue", "$1.2M", "+15%"), ("Users", "45,000", "+8%")]
for metric, value, change in data:
    row = table.add_row().cells
    row[0].text = metric
    row[1].text = value
    row[2].text = change

doc.save("report.docx")
print("Generated: report.docx")
```

---

## Word (.docx) — Pandoc Fallback

```bash
# Simple Markdown → DOCX
pandoc report.md -o report.docx

# With reference document for styling
pandoc report.md -o report.docx --reference-doc=company_style.docx

# With table of contents
pandoc report.md -o report.docx --toc --toc-depth=2
```

---

## Excel (.xlsx) — With Template

```python
from openpyxl import load_workbook
import json

wb = load_workbook("template.xlsx")
ws = wb.active

with open("data.json", encoding="utf-8") as f:
    data = json.load(f)

# Assumes template has headers in row 1
# Fill data starting from row 2
sheet_data = data["sheets"]
for sheet_name, sheet_content in sheet_data.items():
    if sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
    else:
        ws = wb.create_sheet(sheet_name)

    # Write headers
    for col, header in enumerate(sheet_content["headers"], 1):
        ws.cell(row=1, column=col, value=header)

    # Write data rows
    for row_idx, row_data in enumerate(sheet_content["rows"], 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)

wb.save("output.xlsx")
print("Generated: output.xlsx")
```

---

## Excel (.xlsx) — From Scratch

```python
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter
import json

wb = Workbook()

with open("data.json", encoding="utf-8") as f:
    data = json.load(f)

first_sheet = True
for sheet_name, sheet_content in data["sheets"].items():
    if first_sheet:
        ws = wb.active
        ws.title = sheet_name
        first_sheet = False
    else:
        ws = wb.create_sheet(sheet_name)

    headers = sheet_content["headers"]
    rows = sheet_content["rows"]

    # Write headers with bold font
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)

    # Write data rows
    for row_idx, row_data in enumerate(rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)

    # Auto-width columns
    for col_idx in range(1, len(headers) + 1):
        max_len = max(
            len(str(ws.cell(row=r, column=col_idx).value or ""))
            for r in range(1, len(rows) + 2)
        )
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 2, 50)

wb.save("output.xlsx")
print("Generated: output.xlsx")
```

---

## MS Project (.mspdi) — MPXJ

```python
import jpype
if not jpype.isJVMStarted():
    jpype.startJVM()

from net.sf.mpxj import ProjectFile, Duration, TimeUnit
from net.sf.mpxj.mspdi import MSPDIWriter
from java.text import SimpleDateFormat
import json

with open("tasks.json", encoding="utf-8") as f:
    data = json.load(f)

project = ProjectFile()
date_format = SimpleDateFormat("yyyy-MM-dd")

tasks = []
for task_data in data["tasks"]:
    task = project.addTask()
    task.setName(task_data["name"])

    if task_data.get("start"):
        task.setStart(date_format.parse(task_data["start"]))

    if task_data.get("duration"):
        # Parse "5d" → 5 days
        dur_str = task_data["duration"]
        dur_val = int(dur_str.replace("d", "").replace("h", ""))
        unit = TimeUnit.DAYS if "d" in dur_str else TimeUnit.HOURS
        task.setDuration(Duration.getInstance(dur_val, unit))

    tasks.append(task)

# Set predecessors (1-based index)
for i, task_data in enumerate(data["tasks"]):
    for pred_idx in task_data.get("predecessors", []):
        if 0 < pred_idx <= len(tasks):
            tasks[i].addPredecessor(tasks[pred_idx - 1])

writer = MSPDIWriter()
writer.write(project, "output.xml")
print("Generated: output.xml (MSPDI format)")
```

---

## PDF — With WeasyPrint

```python
import weasyprint
import markdown

md_text = """
# Quarterly Report

## Revenue
Total revenue for Q1 2026 was **$1.2M**, representing a 15% increase.

## Users
| Metric | Value |
|--------|-------|
| Active Users | 45,000 |
| New Users | 5,200 |
| Churn Rate | 2.1% |

## Conclusion
Performance exceeded targets across all metrics.
"""

# Convert Markdown → HTML
html = markdown.markdown(md_text, extensions=["tables", "fenced_code"])

# Wrap in full HTML with basic styling
full_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>{html}</body>
</html>
"""

weasyprint.HTML(string=full_html).write_pdf("report.pdf")
print("Generated: report.pdf")
```

---

## PDF — With CSS Template

```python
import weasyprint
import markdown

md_text = open("content.md", encoding="utf-8").read()
html = markdown.markdown(md_text, extensions=["tables", "fenced_code"])

full_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>{html}</body>
</html>
"""

weasyprint.HTML(string=full_html).write_pdf(
    "styled_report.pdf",
    stylesheets=[weasyprint.CSS(filename="corporate_style.css")]
)
print("Generated: styled_report.pdf")
```

**Example CSS template (`corporate_style.css`)**:
```css
@page {
    size: A4;
    margin: 2cm;
    @top-center { content: "Company Name — Confidential"; font-size: 9pt; color: #888; }
    @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; }
}

body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
h1 { color: #1a5276; border-bottom: 2px solid #1a5276; padding-bottom: 0.3em; }
h2 { color: #2e86c1; margin-top: 1.5em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background-color: #1a5276; color: white; }
tr:nth-child(even) { background-color: #f2f2f2; }
```

---

## PDF — Pandoc Fallback

```bash
# Via WeasyPrint engine
pandoc content.md -o output.pdf --pdf-engine=weasyprint --css=style.css

# Via LaTeX engine (requires texlive)
pandoc content.md -o output.pdf --pdf-engine=xelatex

# With custom margins
pandoc content.md -o output.pdf -V geometry:margin=2cm
```

# Templates Guide — Creating Effective Document Templates

How to create and use templates for each supported format. Templates produce polished, branded output with minimal effort.

---

## Why Templates?

Templates separate **content** from **presentation**. Instead of coding fonts, colors, and layouts programmatically, you design once in the native application (PowerPoint, Word, Excel) and inject data at generation time.

| Approach | Pros | Cons |
|----------|------|------|
| With template | Branded, professional output; designers can create templates; content injection is simple | Requires upfront template creation; placeholder mapping |
| Without template | Quick; no dependencies on template files; fully programmatic | Generic appearance; styling requires code; harder to maintain consistency |

**Recommendation**: Always ask the user for a template. Most organizations have branded templates already.

---

## PowerPoint Templates (.pptx)

### How It Works

python-pptx opens the template file and uses its **slide layouts** to create new slides. Each layout has named **placeholders** (title, body, image, etc.) that receive content.

### Creating a Template

1. **Open PowerPoint** → Create a new presentation
2. **View → Slide Master** → Design your master layouts:
   - Title Slide (layout 0 by default)
   - Title and Content (layout 1)
   - Section Header (layout 2)
   - Custom layouts as needed
3. Each layout should have **named placeholders**:
   - Title placeholder (always index 0)
   - Content/body placeholder (typically index 1)
   - Additional placeholders for images, captions, etc.
4. **Set fonts, colors, backgrounds** in the Slide Master — these will be inherited
5. **Save as .pptx**

### Placeholder Discovery

To see what placeholders a template offers:

```python
from pptx import Presentation

prs = Presentation("template.pptx")
for i, layout in enumerate(prs.slide_layouts):
    print(f"Layout {i}: {layout.name}")
    for ph in layout.placeholders:
        print(f"  [{ph.placeholder_format.idx}] {ph.name} ({ph.placeholder_format.type})")
```

### Mapping Rules

| JSON Field | Maps To |
|-----------|---------|
| `layout` | Slide layout name (matched against `layout.name`) |
| `title` | Placeholder index 0 (title) |
| `body` | Placeholder index 1 (content) |
| `notes` | Notes slide text frame |
| `image_path` | Added as picture shape (if no image placeholder exists) |

### Best Practices

- **Name your layouts clearly** (e.g., "Title Slide", "Content with Image", "Two Column") — the script matches by name
- **Keep placeholder indices consistent** — title always 0, body always 1
- **Include a blank layout** for slides that need full custom content
- **Test with a sample slide** before generating 50 slides from a template
- **Don't delete the default layouts** even if unused — some themes reference them

---

## Word Templates (.docx)

### How It Works

docxtpl uses **Jinja2 template syntax** directly inside the Word document. You type `{{ variable }}` and `{% for %}...{% endfor %}` blocks right in Word, and docxtpl replaces them with data at render time.

### Creating a Template

1. **Open Word** → Create your document layout
2. **Type Jinja2 tags** where data should appear:
   - Simple variable: `{{ title }}`
   - Loop: `{% for item in items %}`...`{% endfor %}`
   - Conditional: `{% if show_chart %}`...`{% endif %}`
3. **Format the surrounding text** — the format of the tag text is inherited by the rendered content
4. **Save as .docx**

### Common Tag Patterns

**Simple variables:**
```
Report Title: {{ title }}
Date: {{ date }}
Author: {{ author }}
```

**Lists:**
```
{% for item in items %}
• {{ item.name }}: {{ item.description }}
{% endfor %}
```

**Tables (row repetition):**
```
| Name            | Status          | Notes           |
| --------------- | --------------- | --------------- |
{% for row in rows %}
| {{ row.name }}  | {{ row.status }}| {{ row.notes }} |
{% endfor %}
```

**Conditionals:**
```
{% if include_appendix %}
Appendix A: Detailed Data
{{ appendix_content }}
{% endif %}
```

**Images:**
```python
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Mm

doc = DocxTemplate("template.docx")
image = InlineImage(doc, "chart.png", width=Mm(120))
doc.render({"chart": image})
doc.save("output.docx")
```
In the template, use `{{ chart }}` where the image should appear.

### Critical Rules

- **Type the entire tag in one go.** If you type `{{ `, apply bold, then type `title }}`, Word creates multiple text runs and docxtpl can't parse the tag.
- **Fix broken tags**: Select the tag → Clear All Formatting → Retype if needed
- **Use Word's Find & Replace** to verify all tags are intact: search for `{{` and count matches
- **Test with minimal data first** before passing the full dataset

---

## Excel Templates (.xlsx)

### How It Works

openpyxl opens the template with `load_workbook()`, preserving all formatting, formulas, charts, and styles. You then write data into specific cells.

### Creating a Template

1. **Open Excel** → Design your spreadsheet:
   - Headers in row 1 with formatting (bold, colors, filters)
   - Named ranges for data areas if needed
   - Charts referencing data ranges (they update when data changes)
   - Conditional formatting rules
2. **Leave data rows empty** — the script fills them
3. **Save as .xlsx**

### Data Injection Patterns

**Direct cell writing** (best for known positions):
```python
ws["A2"] = "First value"
ws["B2"] = 42
```

**Row-by-row** (best for tabular data):
```python
start_row = 2  # row 1 is headers
for i, row_data in enumerate(data["rows"]):
    for j, value in enumerate(row_data):
        ws.cell(row=start_row + i, column=j + 1, value=value)
```

**Named ranges** (most robust):
```python
for named_range in wb.defined_names.definedName:
    if named_range.attr_text == "DataStart":
        # Parse the cell reference and start writing from there
        pass
```

### Best Practices

- **Don't use `ws.append()`** on template sheets — it ignores existing formatting
- **Preserve chart references**: If the template has charts pointing to `A1:C10`, make sure data fills that exact range
- **Use number formats**: Set cell format in the template (currency, percentage, date) — openpyxl preserves them
- **Auto-filter**: If the template has auto-filters, they stay active after data injection
- **Hidden columns/rows**: They remain hidden — useful for intermediate calculation columns

---

## CSS Templates for PDF

### How It Works

WeasyPrint renders HTML to PDF using CSS for styling. The CSS file acts as your template — controlling fonts, margins, headers, footers, and page layout.

### Creating a CSS Template

```css
/* Page setup */
@page {
    size: A4;
    margin: 2.5cm 2cm;

    @top-left { content: "Company Name"; font-size: 9pt; color: #666; }
    @top-right { content: string(section-title); font-size: 9pt; color: #666; }
    @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; }
}

/* First page — no header */
@page :first {
    @top-left { content: ""; }
    @top-right { content: ""; }
}

/* Typography */
body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
}

h1 {
    color: #1a5276;
    font-size: 24pt;
    border-bottom: 3px solid #1a5276;
    padding-bottom: 0.3em;
    string-set: section-title content();
}

h2 {
    color: #2e86c1;
    font-size: 16pt;
    margin-top: 1.5em;
    page-break-after: avoid;
}

/* Tables */
table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    page-break-inside: avoid;
}

th {
    background-color: #1a5276;
    color: white;
    padding: 8px 12px;
    text-align: left;
}

td {
    border: 1px solid #ddd;
    padding: 8px 12px;
}

tr:nth-child(even) { background-color: #f8f8f8; }

/* Code blocks */
pre {
    background-color: #f4f4f4;
    padding: 1em;
    border-radius: 4px;
    font-size: 10pt;
    overflow-x: auto;
    page-break-inside: avoid;
}

code {
    font-family: "Cascadia Code", "Fira Code", monospace;
    font-size: 10pt;
}

/* Page breaks */
.page-break { page-break-before: always; }
```

### Best Practices

- **Use `@page` rules** for margins, headers, and footers — they appear on every page
- **Use `page-break-inside: avoid`** on tables and code blocks
- **Use `page-break-after: avoid`** on headings so they don't end up alone at page bottom
- **Font availability**: WeasyPrint uses system fonts — install the font or use `@font-face`
- **Test incrementally**: Generate a short PDF first, then style, then generate the full document

---

## General Template Best Practices

1. **Version control your templates** — store them alongside the project in Git
2. **Document placeholder names** — maintain a table of `{{ tag }}` → meaning for each template
3. **Test with edge cases**: empty data, very long text, special characters, missing optional fields
4. **Keep templates simple** — complex nested loops and conditionals are hard to debug
5. **Provide sample JSON** alongside each template so users know the expected data shape

# Tools Reference — Markdown to Document Generators

Detailed comparison of all tools referenced in the skill. Use this to decide which tool fits a specific scenario.

---

## PowerPoint Tools

### python-pptx

- **Install**: `pip install python-pptx`
- **Type**: Python library
- **License**: MIT
- **Repository**: https://github.com/scanny/python-pptx

| Aspect | Detail |
|--------|--------|
| Strengths | Full control over slides, layouts, placeholders, shapes, images, charts, tables; template support via opening existing .pptx; active maintenance |
| Weaknesses | No Markdown parser — you must structure content programmatically; layout matching can be fragile if template names change; no PDF export |
| Best for | Template-based presentations; programmatic slide generation; inserting charts/images |
| Avoid when | Simple Markdown → PPTX is enough (use pandoc instead) |

**Key API patterns**:
```python
from pptx import Presentation
from pptx.util import Inches, Pt

# From template
prs = Presentation("template.pptx")
layout = prs.slide_layouts[1]  # or .get_by_name("Title and Content")
slide = prs.slides.add_slide(layout)
slide.shapes.title.text = "My Title"
slide.placeholders[1].text = "Body content"

# From scratch
prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = "Title"
prs.save("output.pptx")
```

**Template workflow**: Open existing .pptx → iterate slide_layouts → match by name → add_slide with layout → populate placeholders by index or name.

---

## Word Document Tools

### docxtpl

- **Install**: `pip install docxtpl`
- **Type**: Python library (wraps python-docx + Jinja2)
- **License**: MIT
- **Repository**: https://github.com/elapouya/python-docx-template

| Aspect | Detail |
|--------|--------|
| Strengths | Jinja2 template engine inside Word documents; supports loops, conditionals, images, tables, sub-documents; preserves original formatting |
| Weaknesses | Template must be created manually with Jinja2 tags in Word; complex nesting can be tricky; error messages can be opaque |
| Best for | Reports, letters, contracts — any document with a fixed structure and variable data |
| Avoid when | You need to create a document from scratch without a template (use python-docx directly) |

**Key API patterns**:
```python
from docxtpl import DocxTemplate

doc = DocxTemplate("template.docx")
context = {
    "title": "Monthly Report",
    "items": [
        {"name": "Task 1", "status": "Done"},
        {"name": "Task 2", "status": "Pending"},
    ]
}
doc.render(context)
doc.save("output.docx")
```

**Template syntax in Word**: Type `{{ variable }}` directly in the Word document. For loops: `{% for item in items %}...{% endfor %}`. For conditionals: `{% if condition %}...{% endif %}`.

### python-docx

- **Install**: `pip install python-docx`
- **Type**: Python library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Full programmatic access to create/edit .docx files; paragraphs, tables, images, styles, headers/footers |
| Weaknesses | No template engine — all content must be added via API calls; verbose for complex documents |
| Best for | Creating documents from scratch when no template exists; modifying existing documents programmatically |
| Avoid when | You have a template to fill (use docxtpl instead) |

---

## Excel Tools

### openpyxl

- **Install**: `pip install openpyxl`
- **Type**: Python library
- **License**: MIT
- **Repository**: https://github.com/theorchard/openpyxl

| Aspect | Detail |
|--------|--------|
| Strengths | Read and write .xlsx; template support via load_workbook(); styles, charts, formulas, merged cells, data validation |
| Weaknesses | Only .xlsx (not .xls); can be slow for very large files; chart creation API is complex |
| Best for | Template-based spreadsheets; modifying existing workbooks; detailed cell-level control |
| Avoid when | Creating simple spreadsheets from scratch with no template (XlsxWriter is faster) |

**Key API patterns**:
```python
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

# From template
wb = load_workbook("template.xlsx")
ws = wb.active
ws["A1"] = "Updated Value"
wb.save("output.xlsx")

# From scratch
wb = Workbook()
ws = wb.active
ws.title = "Data"
ws.append(["Name", "Value"])  # header row
ws.append(["Item 1", 42])
wb.save("output.xlsx")
```

### XlsxWriter

- **Install**: `pip install XlsxWriter`
- **Type**: Python library
- **License**: BSD-2-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Fast for creating new .xlsx files; excellent chart support; rich formatting options; memory-efficient for large files |
| Weaknesses | **Write-only** — cannot open or modify existing files; no template support |
| Best for | Creating new spreadsheets from scratch with charts and formatting |
| Avoid when | You need to fill an existing template (use openpyxl) |

---

## PDF Tools

### WeasyPrint

- **Install**: `pip install weasyprint`
- **Type**: Python library
- **License**: BSD-3-Clause
- **Repository**: https://github.com/Kozea/WeasyPrint

| Aspect | Detail |
|--------|--------|
| Strengths | CSS-based styling; excellent typography; supports @page rules for headers/footers/margins; pure Python (no external services); PDF/A support |
| Weaknesses | Requires system-level dependencies on some OSes (GTK/Pango); CSS Flexbox/Grid not fully supported; no JavaScript rendering |
| Best for | Professional PDF generation from HTML+CSS; reports, invoices, contracts |
| Avoid when | You need to render JavaScript-heavy pages (use Playwright/Puppeteer instead) |

**Key API patterns**:
```python
import weasyprint

# From HTML string
html = "<h1>Title</h1><p>Content</p>"
weasyprint.HTML(string=html).write_pdf("output.pdf")

# From HTML file with CSS
weasyprint.HTML(filename="page.html").write_pdf(
    "output.pdf",
    stylesheets=[weasyprint.CSS(filename="style.css")]
)

# From Markdown (convert first)
import markdown
html = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
weasyprint.HTML(string=html).write_pdf("output.pdf")
```

**CSS template features**: Use `@page { margin: 2cm; @top-center { content: "Header"; } }` for page headers/footers. Use `page-break-before: always;` for manual page breaks.

---

## MS Project Tools

### MPXJ

- **Install**: `pip install mpxj`
- **Type**: Python wrapper over Java library
- **License**: LGPL-2.1
- **Repository**: https://github.com/joniles/mpxj

| Aspect | Detail |
|--------|--------|
| Strengths | Reads/writes 20+ project file formats including MSPDI, MPP, Primavera; comprehensive project data model; active maintenance |
| Weaknesses | **Requires Java 11+** — must be installed separately; startup is slower due to JVM initialization; error messages can reference Java internals |
| Best for | Creating MSPDI XML files importable by MS Project; interoperability between project management tools |
| Avoid when | Java is not available and can't be installed; only simple task lists are needed (CSV may suffice) |

**Key API patterns**:
```python
import jpype
import mpxj

# Read
from net.sf.mpxj.reader import UniversalProjectReader
reader = UniversalProjectReader()
project = reader.read("input.mpp")

# Write MSPDI
from net.sf.mpxj.writer import UniversalProjectWriter
from net.sf.mpxj import ProjectFile, Task
from net.sf.mpxj.mspdi import MSPDIWriter

project = ProjectFile()
task = project.addTask()
task.setName("Task 1")
writer = MSPDIWriter()
writer.write(project, "output.xml")
```

**Java dependency**: Always verify Java availability before using MPXJ. Use `runtime_resolver.py java --min-version 11`.

---

## Universal Tools

### Pandoc

- **Install**: System package (`apt install pandoc`, `brew install pandoc`, `choco install pandoc`)
- **Type**: Universal CLI tool (Haskell)
- **License**: GPL-2.0

| Aspect | Detail |
|--------|--------|
| Strengths | Markdown → PPTX/DOCX/PDF in one command; `--reference-doc` for templates; mature and well-documented; supports many Markdown flavors |
| Weaknesses | System dependency (not pip-installable); limited control over slide layouts; template customization is limited to styles, not structure |
| Best for | Quick Markdown → document conversion; when python-pptx/docxtpl is overkill; CI/CD pipelines |
| Avoid when | You need fine-grained control over placeholders, layouts, or programmatic content injection |

**Key patterns**:
```bash
# Markdown → PPTX with template
pandoc input.md -o output.pptx --reference-doc=template.pptx

# Markdown → DOCX with template
pandoc input.md -o output.docx --reference-doc=template.docx

# Markdown → PDF via WeasyPrint
pandoc input.md -o output.pdf --pdf-engine=weasyprint --css=style.css

# Markdown → PDF via LaTeX
pandoc input.md -o output.pdf --pdf-engine=xelatex
```

**`--reference-doc` behavior**: Pandoc copies styles (fonts, colors, layouts) from the reference document and applies them to the output. It does **not** inject content into template placeholders — for that, use docxtpl or python-pptx.

### Carbone (Node.js alternative)

- **Install**: `npm install carbone`
- **Type**: Node.js library
- **License**: Community Edition (free) / Enterprise (paid)

| Aspect | Detail |
|--------|--------|
| Strengths | Template-based generation for DOCX, XLSX, PPTX, ODS, ODT, PDF (via LibreOffice); simple `{d.field}` syntax in templates |
| Weaknesses | Node.js dependency; PDF requires LibreOffice; enterprise features behind paywall |
| Best for | When the team already uses Node.js; multi-format template rendering from a single tool |
| Avoid when | Python-only toolchain; no Node.js available |

Mentioned for awareness — the primary skill workflow uses Python tools.

# Troubleshooting — Markdown to Document Generation

Common issues encountered during document generation and their solutions.

---

## Installation Issues

### python-pptx fails to install

**Symptom**: `pip install python-pptx` fails with build errors.

**Solutions**:
1. Ensure Python 3.8+: `python --version`
2. Upgrade pip: `pip install --upgrade pip`
3. Install in a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate     # Windows
   source .venv/bin/activate  # Linux/macOS
   pip install python-pptx
   ```

### WeasyPrint fails to install

**Symptom**: Installation errors related to missing system dependencies (cairo, pango, gdk-pixbuf).

**Solutions**:
- **Windows**: Install GTK3 runtime or use `pip install weasyprint` (recent versions bundle dependencies)
- **Linux (Debian/Ubuntu)**:
  ```bash
  apt install python3-pip libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev libcairo2
  pip install weasyprint
  ```
- **macOS**:
  ```bash
  brew install pango
  pip install weasyprint
  ```
- Use pandoc as fallback: `pandoc input.md -o output.pdf --pdf-engine=xelatex`

### MPXJ fails — Java not found

**Symptom**: `jpype.JVMNotFoundException` or `No JVM shared library file (jvm.dll) found`.

**Solutions**:
1. Verify Java is installed: `python scripts/runtime_resolver.py java --min-version 11`
2. Install Java JDK 11+:
   - **Windows**: `choco install temurin17` or download from https://adoptium.net
   - **Linux**: `apt install openjdk-17-jdk`
   - **macOS**: `brew install openjdk@17`
3. Set `JAVA_HOME` environment variable:
   ```bash
   # Windows (PowerShell)
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17"
   # Linux/macOS
   export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
   ```
4. Restart the terminal after setting JAVA_HOME

### docxtpl install conflict with python-docx

**Symptom**: docxtpl requires a specific python-docx version.

**Solutions**:
1. Install docxtpl first — it will pull the correct python-docx version:
   ```bash
   pip install docxtpl
   ```
2. If already installed, reinstall:
   ```bash
   pip install --force-reinstall docxtpl
   ```

---

## Template Issues

### PPTX: Placeholder not found

**Symptom**: Script raises `KeyError` or placeholders appear empty after generation.

**Solutions**:
1. List available placeholders in the template:
   ```python
   from pptx import Presentation
   prs = Presentation("template.pptx")
   for layout in prs.slide_layouts:
       print(f"Layout: {layout.name}")
       for ph in layout.placeholders:
           print(f"  [{ph.placeholder_format.idx}] {ph.name}: {ph.placeholder_format.type}")
   ```
2. Use placeholder index instead of name — names vary between templates
3. Ensure the template has **slide layouts**, not just slides — new slides inherit from layouts

### PPTX: Layout name mismatch

**Symptom**: Script uses "Title and Content" but template has "Title, Content" or a localized name.

**Solutions**:
1. Print all layout names (see above) and match exactly
2. Fall back to index-based matching: `prs.slide_layouts[1]`
3. Use fuzzy matching in your code if multiple templates are expected

### DOCX: Jinja2 tags not rendered

**Symptom**: Output contains literal `{{ variable }}` text instead of rendered values.

**Solutions**:
1. Ensure tags are in the same text run in Word — formatting mid-tag breaks parsing:
   - ❌ `{{ var` (bold) `iable }}` (normal) — Word splits into multiple runs
   - ✅ `{{ variable }}` — type the whole tag at once, then format
2. Use docxtpl's `RichText` for formatted output
3. Clear formatting on the tag text: select the tag → Clear All Formatting in Word

### DOCX: Table rows not expanding in loop

**Symptom**: `{% for %}` loop in a table only renders one row.

**Solutions**:
1. The `{% for %}` and `{% endfor %}` tags must be in cells of their own row
2. Correct table structure:
   ```
   | {% for item in items %} |              |
   | {{ item.name }}         | {{ item.val }}|
   | {% endfor %}            |              |
   ```
3. Or use docxtpl's table syntax: put tags in a single row that will be duplicated

### XLSX: Template formatting lost

**Symptom**: After writing data with openpyxl, cell formatting from the template is gone.

**Solutions**:
1. Write values only — don't overwrite formatting:
   ```python
   ws.cell(row=2, column=1).value = "New data"  # preserves existing format
   ```
2. Don't use `ws.append()` on template worksheets — it adds rows without formatting
3. Copy formatting from template rows before writing if needed

---

## Runtime Dependency Issues

### Java: JAVA_HOME set but MPXJ still fails

**Symptom**: `JAVA_HOME` is configured but jpype can't find `jvm.dll` / `libjvm.so`.

**Solutions**:
1. JAVA_HOME must point to the JDK root, not the `bin/` directory:
   - ❌ `JAVA_HOME=C:\Program Files\Java\jdk-17\bin`
   - ✅ `JAVA_HOME=C:\Program Files\Java\jdk-17`
2. Run `runtime_resolver.py` to auto-detect: `python scripts/runtime_resolver.py java`
3. On Windows, check both `jdk` and `jre` paths in Program Files

### Pandoc: "pandoc not found"

**Symptom**: `FileNotFoundError` when running pandoc commands.

**Solutions**:
1. Verify installation: `pandoc --version`
2. Install: `choco install pandoc` (Windows), `apt install pandoc` (Linux), `brew install pandoc` (macOS)
3. If recently installed, restart the terminal to reload PATH

### WeasyPrint: "cairo not found" on Linux

**Symptom**: `OSError: no library called "cairo-2" was found`.

**Solutions**:
```bash
apt install libcairo2-dev
# or
apt install python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0
```

---

## Encoding Issues

### Non-ASCII characters garbled in output

**Symptom**: Accented characters, CJK, or emoji appear as `?` or boxes in generated documents.

**Solutions**:
1. Ensure JSON input is UTF-8:
   ```python
   with open("data.json", encoding="utf-8") as f:
       data = json.load(f)
   ```
2. For PPTX/DOCX: python-pptx and docxtpl handle Unicode natively — the issue is usually in the input file
3. For PDF: ensure the CSS specifies a font that supports the characters:
   ```css
   body { font-family: "Noto Sans", "Arial Unicode MS", sans-serif; }
   ```
4. For Excel: openpyxl handles Unicode natively

### PDF: Fonts not rendering correctly

**Symptom**: PDF uses fallback font; custom fonts from CSS are ignored.

**Solutions**:
1. Install the font on the system — WeasyPrint uses system fonts
2. Use `@font-face` in CSS with a local file path:
   ```css
   @font-face {
       font-family: "Custom Font";
       src: url("fonts/CustomFont.ttf");
   }
   ```
3. On Linux, run `fc-cache -fv` after installing fonts

---

## Format-Specific Issues

### PPTX: Images not appearing

**Symptom**: Slides are generated but images referenced in JSON are missing.

**Solutions**:
1. Verify image paths are absolute or relative to the script's working directory
2. Supported formats: PNG, JPEG, GIF, BMP, TIFF — SVG is not supported by python-pptx
3. Check image dimensions — very large images may cause memory issues

### DOCX: Page breaks ignored

**Symptom**: Content runs together without page breaks.

**Solutions**:
1. Use python-docx page breaks:
   ```python
   from docx.enum.text import WD_BREAK
   doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
   ```
2. In docxtpl templates, insert a Word page break in the template itself

### XLSX: Numbers stored as text

**Symptom**: Excel shows a green triangle warning; numbers won't calculate.

**Solutions**:
1. Ensure values are Python numbers, not strings:
   ```python
   ws.cell(row=2, column=1, value=42)      # ✅ number
   ws.cell(row=2, column=1, value="42")     # ❌ text
   ```
2. Parse from JSON with type conversion:
   ```python
   value = float(raw_value) if raw_value.replace(".", "").isdigit() else raw_value
   ```

### PDF: Tables break across pages badly

**Symptom**: Table rows are split mid-cell at page boundaries.

**Solutions**:
1. Add CSS to prevent row splitting:
   ```css
   tr { page-break-inside: avoid; }
   ```
2. For very long tables, consider splitting into sections with headers repeated:
   ```css
   thead { display: table-header-group; }
   ```
3. Use `page-break-before: always;` on section headings to control flow

### MSPDI: MS Project won't import the XML

**Symptom**: MS Project shows import error or ignores tasks.

**Solutions**:
1. Ensure the XML uses the correct MSPDI namespace — MPXJ handles this automatically
2. Check date formats: MSPDI expects ISO 8601 (`2026-03-11T08:00:00`)
3. Verify task UIDs are unique — MPXJ generates them automatically
4. Try opening in Project Professional instead of Project Online — online has stricter validation