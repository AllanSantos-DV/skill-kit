---
name: cc-doc-to-markdown
description: "Convert binary/Office documents to Markdown for LLM consumption. USE FOR: converting Word, Excel, PowerPoint, PDF, Visio, MS Project files to Markdown, batch document conversion, extracting text from non-readable formats. DO NOT USE FOR: Markdown formatting/linting, general file I/O, web scraping, image generation."
---
# Document to Markdown — Agent Guide

You are helping a developer convert binary or non-LLM-readable document formats into clean Markdown. The primary tool is **markitdown** by Microsoft — a Python CLI and library purpose-built for LLM consumption. Use fallback tools only when markitdown doesn't support the format or produces poor output.

## Installation

### Primary: markitdown

```bash
# Basic install
pip install markitdown

# Full install (includes OCR, all optional deps)
pip install 'markitdown[all]'
```

### Verify installation

```bash
markitdown --help
```

### Script Prerequisites

| Script | pip install | System |
|--------|-----------|--------|
| `convert.py` | `markitdown` | — |
| `convert.py` (OCR) | `markitdown[all]` | — |
| `convert.py --tool pdfplumber` | `pdfplumber` | — |
| `convert.py --tool mammoth` | `mammoth` | — |
| `convert.py --tool mpxj` | `mpxj jpype1` | Java 11+ |
| `batch_convert.py` | `markitdown` | — |
| `batch_convert.py` (.mpp) | `markitdown mpxj jpype1` | Java 11+ |
| `extract_tables.py` (PDF) | `pdfplumber` | — |
| `extract_tables.py` (Excel) | `pandas tabulate openpyxl` | — |

Scripts auto-install missing packages in interactive terminals. In non-interactive environments (LLM agents, CI), packages are installed automatically without prompting.

#### Quick Install (all dependencies)

```bash
pip install markitdown pdfplumber mammoth pandas tabulate openpyxl mpxj jpype1
```

## Standalone Scripts

This skill includes ready-to-run Python scripts in the `scripts/` directory.

> **⚠️ IMPORTANT: Treat scripts as black boxes.** Run `python scripts/<script>.py --help` to learn usage. Do **NOT** read the source code of these scripts — it will pollute your context window with implementation details you don't need. The scripts are designed to be used via their CLI interface only.

When the user needs conversion, **execute these directly** via `run_in_terminal` instead of generating code from scratch.

| Script | Purpose | Quick Usage |
|--------|---------|-------------|
| `convert.py` | Single file → Markdown | `python scripts/convert.py file.docx -o output.md` |
| `batch_convert.py` | Entire directory → Markdown | `python scripts/batch_convert.py ./docs -o ./md_output -r` |
| `extract_tables.py` | Tables from PDF/Excel → Markdown | `python scripts/extract_tables.py report.pdf` |

All scripts accept `--help` for full usage. Paths are passed as parameters — never hardcoded.

> **Working directory:** Run scripts from any directory using absolute paths, or from the skill's root directory using relative paths (`python scripts/convert.py ...`).

When the user asks for conversion, prefer running the bundled scripts over generating inline code. Adjust parameters to match the user's specific paths and requirements.

## Format → Tool Mapping

Use this table to determine the conversion approach:

| Format | Extensions | Primary Tool | Fallback Tools |
|--------|-----------|-------------|----------------|
| Word | .docx | markitdown | mammoth (Node.js), pandoc |
| Word (legacy) | .doc | markitdown | LibreOffice headless → .docx → markitdown |
| Excel | .xlsx, .xls | markitdown | pandas `.to_markdown()`, openpyxl |
| CSV | .csv | markitdown | pandas `.to_markdown()`, direct parse |
| PowerPoint | .pptx | markitdown | python-pptx (slide-by-slide extraction) |
| PowerPoint (legacy) | .ppt | markitdown | LibreOffice headless → .pptx → markitdown |
| PDF | .pdf | markitdown | PyMuPDF (fitz), pdfplumber (tables), pdf-parse (Node.js) |
| Visio | .vsd, .vsdx | _not supported_ | LibreOffice headless → SVG/PDF → OCR, or export to PPTX → python-pptx |
| MS Project | .mpp, .mspdi, .mpx | mpxj (via convert.py) | Export to CSV → markitdown |
| HTML | .html, .htm | markitdown | pandoc, BeautifulSoup |
| EPUB | .epub | markitdown | pandoc |
| Images (OCR) | .png, .jpg, .jpeg, .gif, .bmp, .tiff | markitdown (`[all]`) | pytesseract, EasyOCR |
| Audio | .mp3, .wav, .m4a | markitdown (`[all]`) | Whisper (OpenAI), SpeechRecognition |
| Jupyter Notebook | .ipynb | markitdown | nbconvert (`jupyter nbconvert --to markdown`) |
| ZIP Archive | .zip | markitdown | Python zipfile + per-file conversion |
| Outlook Email | .msg | markitdown | extract-msg, python-oletools |
| RSS/ATOM Feed | .xml (feeds) | markitdown | feedparser |

## Conversion Guide

### Quick One-Off (CLI)

For a single file, use the CLI:

```bash
markitdown path/to/file.docx > output.md
```

This works for: `.docx`, `.xlsx`, `.pptx`, `.pdf`, `.html`, `.epub`, `.csv`, `.xls`

### Programmatic (Python API)

For integration into scripts or when you need to process the output:

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("path/to/file.docx")
print(result.text_content)
```

To save with metadata frontmatter:

```python
from markitdown import MarkItDown
from datetime import datetime
from pathlib import Path

def convert_with_metadata(input_path: str, output_path: str | None = None) -> str:
    md = MarkItDown()
    result = md.convert(input_path)

    source = Path(input_path).name
    date = datetime.now().strftime("%Y-%m-%d")
    frontmatter = f"---\nsource: \"{source}\"\nconverted: \"{date}\"\n---\n\n"
    content = frontmatter + result.text_content

    if output_path:
        Path(output_path).write_text(content, encoding="utf-8")
    return content
```

### Per-Format Instructions

#### Word (.doc, .docx)

Use markitdown directly. If output has formatting issues:
1. Try mammoth for .docx — it produces cleaner HTML-to-Markdown for complex layouts
2. Try pandoc: `pandoc -f docx -t markdown file.docx -o output.md`
3. For legacy .doc: convert to .docx first via LibreOffice headless if markitdown fails:
   ```bash
   libreoffice --headless --convert-to docx file.doc
   markitdown file.docx > output.md
   ```

#### Excel (.xlsx, .xls, .csv)

markitdown renders each sheet as a Markdown table. If you need more control:

```python
import pandas as pd

df = pd.read_excel("file.xlsx", sheet_name=None)  # all sheets
for name, sheet in df.items():
    print(f"## Sheet: {name}\n")
    print(sheet.to_markdown(index=False))
    print()
```

For CSV:
```python
import pandas as pd
df = pd.read_csv("file.csv")
print(df.to_markdown(index=False))
```

#### PowerPoint (.ppt, .pptx)

markitdown extracts text slide-by-slide. If you need structured extraction with slide titles:

```python
from pptx import Presentation

prs = Presentation("file.pptx")
for i, slide in enumerate(prs.slides, 1):
    title = slide.shapes.title
    print(f"## Slide {i}: {title.text if title else 'Untitled'}\n")
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                print(para.text)
    print()
```

#### PDF (.pdf)

markitdown handles most PDFs. For table-heavy PDFs, pdfplumber gives better results:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            print(text)
        tables = page.extract_tables()
        for table in tables:
            # Convert to Markdown table
            header = "| " + " | ".join(str(c) for c in table[0]) + " |"
            sep = "| " + " | ".join("---" for _ in table[0]) + " |"
            rows = "\n".join("| " + " | ".join(str(c) for c in row) + " |" for row in table[1:])
            print(f"{header}\n{sep}\n{rows}\n")
```

#### Visio (.vsd, .vsdx)

No direct Python converter exists. Use this cascade:

1. **Best**: Ask the user to export from Visio as PDF or SVG, then convert that
2. **Automated**: Use LibreOffice headless to convert to PDF, then use markitdown or PyMuPDF:
   ```bash
   libreoffice --headless --convert-to pdf diagram.vsdx
   markitdown diagram.pdf > output.md
   ```
3. **OCR route**: Convert to image, then use markitdown with OCR support:
   ```bash
   libreoffice --headless --convert-to png diagram.vsdx
   pip install 'markitdown[all]'
   markitdown diagram.png > output.md
   ```

Always warn the user: Visio conversion is lossy. Complex diagrams with connectors and swimlanes will lose structural information. Suggest Mermaid diagrams as the target representation if the user needs to preserve diagram logic.

#### MS Project (.mpp, .mspdi, .mpx)

Natively supported via `convert.py --tool mpxj`. Requires Java 11+ (auto-detected).

```bash
python scripts/convert.py project.mpp -o project.md
```

Output includes: project properties, resources table, full task table (WBS, dates, durations, predecessors, resources), and summary statistics. The script uses MPXJ's UniversalProjectReader which handles .mpp (all versions), .mspdi (XML), and .mpx formats.

If Java is not available, ask the user to:
1. Install Java 11+: `choco install temurin17` (Windows) or `apt install openjdk-17-jdk` (Linux)
2. Or export from MS Project as CSV, then: `python scripts/convert.py project.csv -o project.md`

#### Images (.png, .jpg, .jpeg, .gif, .bmp, .tiff)

Requires the full install: `pip install 'markitdown[all]'`

markitdown uses OCR to extract text from images. Best results with:
- High-resolution images (300+ DPI)
- Clean, printed text (not handwriting)
- Good contrast between text and background

```bash
markitdown scan.png > output.md
```

If OCR quality is poor, suggest the user try preprocessing the image (increase contrast, deskew) or use a dedicated OCR tool like Tesseract directly.

#### Audio (.mp3, .wav, .m4a)

Requires the full install: `pip install 'markitdown[all]'`

markitdown transcribes audio files using speech-to-text. Useful for meeting recordings, voice notes, and dictation.

```bash
markitdown meeting.mp3 > transcript.md
```

For long audio files (> 30 min), warn the user that conversion may take significant time and the transcript should be reviewed for accuracy. For higher-quality transcription, suggest OpenAI Whisper directly:
```bash
pip install openai-whisper
whisper meeting.mp3 --output_format txt
```

#### Jupyter Notebook (.ipynb)

markitdown extracts notebook cells natively — code cells, markdown cells, and outputs.

```bash
markitdown analysis.ipynb > analysis.md
```

Fallback with nbconvert for more control over output:
```bash
jupyter nbconvert --to markdown analysis.ipynb
```

#### ZIP Archive (.zip)

markitdown extracts the ZIP contents and converts each supported file inside:

```bash
markitdown documents.zip > contents.md
```

The output includes all convertible files from the archive with headers indicating the source file within the ZIP. Non-convertible files are listed but skipped.

#### Outlook Email (.msg)

markitdown extracts email headers (From, To, Subject, Date) and body content:

```bash
markitdown email.msg > email.md
```

Attachments are listed but not automatically converted. If the user needs attachment content, suggest extracting the .msg file first and then converting each attachment separately.

#### RSS/ATOM Feed (.xml)

markitdown can parse RSS and ATOM feed XML files, extracting entries as markdown:

```bash
markitdown feed.xml > feed.md
```

Note: This only works with RSS/ATOM feed XML, not arbitrary XML files. For arbitrary XML, the LLM can read it directly — no conversion needed.

## Batch Processing

### Directory Batch Conversion Script

When the user needs to convert multiple files, provide this pattern:

```python
from markitdown import MarkItDown
from pathlib import Path
from datetime import datetime

SUPPORTED = {".docx", ".doc", ".xlsx", ".xls", ".csv", ".pptx", ".ppt", ".pdf", ".html", ".epub", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".mp3", ".wav", ".m4a", ".ipynb", ".zip", ".msg"}

def batch_convert(input_dir: str, output_dir: str | None = None):
    md = MarkItDown()
    input_path = Path(input_dir)
    output_path = Path(output_dir) if output_dir else input_path

    if output_dir:
        output_path.mkdir(parents=True, exist_ok=True)

    converted = []
    failed = []

    for file in input_path.rglob("*"):
        if file.suffix.lower() not in SUPPORTED:
            continue
        try:
            result = md.convert(str(file))
            out_file = output_path / file.relative_to(input_path).with_suffix(".md")
            out_file.parent.mkdir(parents=True, exist_ok=True)

            frontmatter = f"---\nsource: \"{file.name}\"\nconverted: \"{datetime.now().strftime('%Y-%m-%d')}\"\n---\n\n"
            out_file.write_text(frontmatter + result.text_content, encoding="utf-8")
            converted.append(str(file))
        except Exception as e:
            failed.append((str(file), str(e)))

    print(f"Converted: {len(converted)} files")
    for f in converted:
        print(f"  ✓ {f}")
    if failed:
        print(f"Failed: {len(failed)} files")
        for f, err in failed:
            print(f"  ✗ {f}: {err}")
```

### CLI Batch (one-liner)

```bash
for f in docs/*.docx; do markitdown "$f" > "${f%.docx}.md"; done
```

PowerShell:
```powershell
Get-ChildItem docs\*.docx | ForEach-Object { markitdown $_.FullName | Set-Content ($_.FullName -replace '\.docx$', '.md') -Encoding UTF8 }
```

## Output Quality Tips

After conversion, apply these cleanup steps when output quality matters:

1. **Strip excessive whitespace**: Collapse 3+ consecutive blank lines to 2
2. **Normalize headings**: Ensure heading levels are sequential (no jumping from `#` to `###`)
3. **Add frontmatter**: Include `source`, `converted` date, and optionally `format` fields
4. **Handle images**: markitdown with `[all]` uses OCR to describe images as alt-text. Without OCR, images appear as empty image references — warn the user about this
5. **Table cleanup**: markitdown sometimes produces tables with misaligned columns — advise using a Markdown formatter if tables look broken

## When the User Asks for Help

- **"Convert this document to Markdown"** → Identify the file format from the extension. Run `python scripts/convert.py <path> -o <output>` via terminal. Use `--tool` to force a specific converter if markitdown output is poor. Always verify markitdown is installed first (`pip install markitdown`).

- **"I need to batch-convert a folder of documents"** → Run `python scripts/batch_convert.py <dir> -o <output_dir> -r` via terminal. Use `--dry-run` first to preview. Ask what formats to include (`-f docx,pdf`) and whether to recurse into subdirectories.

- **"The converted output looks bad / has formatting issues"** → Read the [troubleshooting guide](./references/troubleshooting.md). Check if the format has a better fallback tool in the mapping table. For tables, suggest pdfplumber (PDF) or pandas (Excel). For complex Word layouts, suggest mammoth.

- **"How do I convert a Visio diagram?"** → Explain that no direct converter exists. Offer the cascade: manual export → LibreOffice headless → OCR. Suggest Mermaid as a better representation for diagrams that need to stay editable.

- **"How do I convert an .mpp file?"** → Explain mpxj option (requires JVM) or suggest exporting from MS Project as CSV/XML first. Provide the appropriate parsing code.

- **"Can I convert images/scanned documents?"** → Yes, run `python scripts/convert.py scan.png --ocr -o output.md`. Requires `pip install 'markitdown[all]'` for OCR. Quality depends on image resolution and text clarity.

- **"Can I transcribe audio to Markdown?"** → Yes, run `python scripts/convert.py meeting.mp3 -o transcript.md`. Requires `pip install 'markitdown[all]'` for speech-to-text. For long files (> 30 min), warn about processing time. For better quality, suggest OpenAI Whisper.

- **"Convert a Jupyter notebook?"** → Run `python scripts/convert.py notebook.ipynb -o notebook.md`. markitdown extracts code cells, markdown cells, and outputs natively.

- **"What about password-protected files?"** → markitdown does not handle encrypted/password-protected files. The user must remove protection first. For PDFs, suggest `qpdf --decrypt` if the password is known.

For detailed tool comparisons, see [tools-reference.md](./references/tools-reference.md).
For code examples by format, see [examples.md](./references/examples.md).
For troubleshooting common issues, see [troubleshooting.md](./references/troubleshooting.md).

## Quick Reference

| I need to... | Tool | Command |
|-------------|------|---------|
| Convert a single file | markitdown CLI | `markitdown file.docx > output.md` |
| Convert a single file (scripted) | convert.py | `python scripts/convert.py file.docx -o output.md` |
| Batch-convert a directory | batch_convert.py | `python scripts/batch_convert.py ./docs -o ./md_output -r` |
| Extract tables from PDF/Excel | extract_tables.py | `python scripts/extract_tables.py report.pdf` |
| Convert with OCR (images) | markitdown[all] | `pip install 'markitdown[all]' && markitdown scan.png > out.md` |
| Transcribe audio | markitdown[all] | `pip install 'markitdown[all]' && markitdown meeting.mp3 > out.md` |
| Convert legacy .doc/.ppt | LibreOffice → markitdown | `libreoffice --headless --convert-to docx file.doc && markitdown file.docx > out.md` |
| Convert Visio diagram | LibreOffice → PDF → markitdown | `libreoffice --headless --convert-to pdf diagram.vsdx && markitdown diagram.pdf > out.md` |
| Check script usage | --help flag | `python scripts/convert.py --help` |

## Companion Skills

- For **the reverse direction** (Markdown → documents): use **markdown-to-document**
- For **template pattern extraction** before generating documents: use **markdown-to-document** (`analyze_template.py`)


---

## References

# Examples — Document to Markdown Conversion

Practical, copy-paste-ready code examples for each format. Python is the primary language; Node.js alternatives are provided where relevant.

---

## Word (.docx) — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("report.docx")
print(result.text_content)
```

### Save to file with frontmatter

```python
from markitdown import MarkItDown
from pathlib import Path
from datetime import datetime

md = MarkItDown()
result = md.convert("report.docx")

output = f"""---
source: "report.docx"
converted: "{datetime.now().strftime('%Y-%m-%d')}"
format: docx
---

{result.text_content}
"""

Path("report.md").write_text(output, encoding="utf-8")
```

### Fallback: mammoth (Node.js)

```javascript
const mammoth = require("mammoth");
const fs = require("fs");

async function convertDocx(inputPath, outputPath) {
  const result = await mammoth.convertToMarkdown({ path: inputPath });
  fs.writeFileSync(outputPath, result.value, "utf-8");
  if (result.messages.length > 0) {
    console.warn("Warnings:", result.messages);
  }
}

convertDocx("report.docx", "report.md");
```

### Fallback: pandoc CLI

```bash
# GitHub Flavored Markdown output
pandoc -f docx -t gfm --wrap=none report.docx -o report.md

# With table of contents
pandoc -f docx -t gfm --toc report.docx -o report.md

# Extract images to media/ folder
pandoc -f docx -t gfm --extract-media=media report.docx -o report.md
```

---

## Excel (.xlsx) — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("data.xlsx")
print(result.text_content)
```

### Pandas — all sheets with headers

```python
import pandas as pd

sheets = pd.read_excel("data.xlsx", sheet_name=None)

output = []
for name, df in sheets.items():
    output.append(f"## Sheet: {name}\n")
    output.append(df.to_markdown(index=False))
    output.append("")

print("\n".join(output))
```

### Pandas — specific sheet with filtering

```python
import pandas as pd

df = pd.read_excel("data.xlsx", sheet_name="Sales")
# Filter rows where Amount > 1000
filtered = df[df["Amount"] > 1000]
print(filtered.to_markdown(index=False))
```

### CSV conversion

```python
import pandas as pd

df = pd.read_csv("data.csv")
print(df.to_markdown(index=False))
```

### Large spreadsheet — chunked output

```python
import pandas as pd

df = pd.read_excel("large_file.xlsx")

# Output first 100 rows as preview
print("## Preview (first 100 rows)\n")
print(df.head(100).to_markdown(index=False))
print(f"\n*... {len(df) - 100} more rows omitted*")
```

---

## PowerPoint (.pptx) — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("presentation.pptx")
print(result.text_content)
```

### Structured extraction with python-pptx

```python
from pptx import Presentation

def pptx_to_markdown(path: str) -> str:
    prs = Presentation(path)
    output = []

    for i, slide in enumerate(prs.slides, 1):
        # Slide title
        title = slide.shapes.title
        title_text = title.text if title else "Untitled"
        output.append(f"## Slide {i}: {title_text}\n")

        # Slide content
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = para.text.strip()
                    if text and text != title_text:
                        level = para.level
                        indent = "  " * level
                        output.append(f"{indent}- {text}")

        # Speaker notes
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                output.append(f"\n> **Speaker Notes**: {notes}")

        output.append("")

    return "\n".join(output)

print(pptx_to_markdown("presentation.pptx"))
```

---

## PDF — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("document.pdf")
print(result.text_content)
```

### Table-heavy PDF with pdfplumber

```python
import pdfplumber

def pdf_tables_to_markdown(path: str) -> str:
    output = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            output.append(f"## Page {i}\n")

            # Extract text
            text = page.extract_text()
            if text:
                output.append(text)

            # Extract tables
            tables = page.extract_tables()
            for j, table in enumerate(tables):
                if not table or not table[0]:
                    continue
                output.append(f"\n### Table {j + 1}\n")
                # Header
                header = "| " + " | ".join(str(c or "") for c in table[0]) + " |"
                sep = "| " + " | ".join("---" for _ in table[0]) + " |"
                output.append(header)
                output.append(sep)
                # Rows
                for row in table[1:]:
                    output.append("| " + " | ".join(str(c or "") for c in row) + " |")
                output.append("")

    return "\n".join(output)

print(pdf_tables_to_markdown("report.pdf"))
```

### PyMuPDF — fast extraction with page control

```python
import fitz  # PyMuPDF

def pdf_to_markdown_fast(path: str, max_pages: int | None = None) -> str:
    doc = fitz.open(path)
    output = []
    pages = doc[:max_pages] if max_pages else doc

    for i, page in enumerate(pages, 1):
        output.append(f"## Page {i}\n")
        output.append(page.get_text("text"))
        output.append("")

    return "\n".join(output)

print(pdf_to_markdown_fast("large_document.pdf", max_pages=50))
```

### Node.js — pdf-parse

```javascript
const fs = require("fs");
const pdfParse = require("pdf-parse");

async function pdfToMarkdown(inputPath) {
  const buffer = fs.readFileSync(inputPath);
  const data = await pdfParse(buffer);
  return data.text;
}

pdfToMarkdown("document.pdf").then(console.log);
```

---

## Visio (.vsd, .vsdx)

### LibreOffice headless → PDF → markitdown

```bash
# Step 1: Convert Visio to PDF
libreoffice --headless --convert-to pdf diagram.vsdx --outdir /tmp

# Step 2: Convert PDF to Markdown
markitdown /tmp/diagram.pdf > diagram.md
```

### LibreOffice headless → Image → OCR

```bash
# Step 1: Convert to PNG
libreoffice --headless --convert-to png diagram.vsdx --outdir /tmp

# Step 2: OCR with markitdown (requires markitdown[all])
pip install 'markitdown[all]'
markitdown /tmp/diagram.png > diagram.md
```

### Python automation

```python
import subprocess
from pathlib import Path
from markitdown import MarkItDown

def visio_to_markdown(visio_path: str) -> str:
    visio = Path(visio_path)

    # Convert to PDF via LibreOffice
    subprocess.run([
        "libreoffice", "--headless", "--convert-to", "pdf",
        str(visio), "--outdir", str(visio.parent)
    ], check=True)

    pdf_path = visio.with_suffix(".pdf")
    md = MarkItDown()
    result = md.convert(str(pdf_path))

    # Cleanup intermediate PDF
    pdf_path.unlink(missing_ok=True)

    return result.text_content

print(visio_to_markdown("architecture.vsdx"))
```

---

## MS Project (.mpp)

### mpxj — task list extraction

```python
import jpype
import jpype.imports

if not jpype.isJVMStarted():
    jpype.startJVM()

from net.sf.mpxj.reader import UniversalProjectReader

def mpp_to_markdown(path: str) -> str:
    reader = UniversalProjectReader()
    project = reader.read(path)

    output = [f"# {project.getProjectProperties().getProjectTitle() or 'Project'}\n"]

    output.append("| ID | Task | Start | Finish | Duration | % Complete |")
    output.append("|----|------|-------|--------|----------|------------|")

    for task in project.getTasks():
        if task.getName() is None:
            continue
        tid = task.getID() or ""
        name = task.getName() or ""
        start = str(task.getStart() or "")
        finish = str(task.getFinish() or "")
        duration = str(task.getDuration() or "")
        pct = str(task.getPercentageComplete() or "0")
        output.append(f"| {tid} | {name} | {start} | {finish} | {duration} | {pct}% |")

    return "\n".join(output)

print(mpp_to_markdown("project.mpp"))
```

### From exported CSV

```python
import pandas as pd

df = pd.read_csv("project_tasks.csv")
print(df.to_markdown(index=False))
```

### From exported XML

```python
import xml.etree.ElementTree as ET

def mpp_xml_to_markdown(xml_path: str) -> str:
    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"ms": "http://schemas.microsoft.com/project"}

    output = ["| Task | Start | Finish | Duration |"]
    output.append("|------|-------|--------|----------|")

    for task in root.findall(".//ms:Task", ns):
        name = task.findtext("ms:Name", default="", namespaces=ns)
        start = task.findtext("ms:Start", default="", namespaces=ns)[:10]  # date only
        finish = task.findtext("ms:Finish", default="", namespaces=ns)[:10]
        duration = task.findtext("ms:Duration", default="", namespaces=ns)
        if name:
            output.append(f"| {name} | {start} | {finish} | {duration} |")

    return "\n".join(output)

print(mpp_xml_to_markdown("project.xml"))
```

---

## Images (.png, .jpg) — OCR via markitdown

### Basic OCR conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("scanned_document.png")
print(result.text_content)
```

### Batch image OCR

```python
from markitdown import MarkItDown
from pathlib import Path

md = MarkItDown()
image_dir = Path("scanned_pages")

for img in sorted(image_dir.glob("*.png")):
    result = md.convert(str(img))
    print(f"## {img.name}\n")
    print(result.text_content)
    print()
```

---

## Audio (.mp3, .wav) — Transcription via markitdown

### Basic transcription

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("meeting.mp3")
print(result.text_content)
```

### Fallback: OpenAI Whisper (higher quality)

```bash
pip install openai-whisper
whisper meeting.mp3 --output_format txt --language pt
```

```python
import whisper

model = whisper.load_model("base")
result = model.transcribe("meeting.mp3")
print(result["text"])
```

---

## Jupyter Notebook (.ipynb) — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("analysis.ipynb")
print(result.text_content)
```

### Fallback: nbconvert

```bash
jupyter nbconvert --to markdown analysis.ipynb
```

```python
import subprocess
subprocess.run(["jupyter", "nbconvert", "--to", "markdown", "analysis.ipynb"], check=True)
```

---

## ZIP Archive (.zip) — markitdown

### Basic extraction and conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("documents.zip")
print(result.text_content)
```

---

## Outlook Email (.msg) — markitdown

### Basic conversion

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("email.msg")
print(result.text_content)
```

### Fallback: extract-msg

```python
import extract_msg

msg = extract_msg.Message("email.msg")
print(f"# {msg.subject}\n")
print(f"**From**: {msg.sender}")
print(f"**To**: {msg.to}")
print(f"**Date**: {msg.date}\n")
print(msg.body)
```

---

## Batch Conversion

### Convert entire directory

```python
from markitdown import MarkItDown
from pathlib import Path
from datetime import datetime

SUPPORTED = {".docx", ".doc", ".xlsx", ".xls", ".csv", ".pptx", ".ppt", ".pdf", ".html", ".epub", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".mp3", ".wav", ".m4a", ".ipynb", ".zip", ".msg"}

def batch_convert(input_dir: str, output_dir: str | None = None):
    md = MarkItDown()
    src = Path(input_dir)
    dst = Path(output_dir) if output_dir else src

    results = {"converted": [], "failed": []}

    for file in sorted(src.rglob("*")):
        if file.suffix.lower() not in SUPPORTED:
            continue
        try:
            result = md.convert(str(file))

            out_file = dst / file.relative_to(src).with_suffix(".md")
            out_file.parent.mkdir(parents=True, exist_ok=True)

            frontmatter = (
                f"---\n"
                f"source: \"{file.name}\"\n"
                f"converted: \"{datetime.now().strftime('%Y-%m-%d')}\"\n"
                f"format: \"{file.suffix.lstrip('.')}\"\n"
                f"---\n\n"
            )
            out_file.write_text(frontmatter + result.text_content, encoding="utf-8")
            results["converted"].append(str(file.name))
        except Exception as e:
            results["failed"].append({"file": str(file.name), "error": str(e)})

    # Summary
    print(f"## Conversion Summary\n")
    print(f"- Converted: {len(results['converted'])}")
    print(f"- Failed: {len(results['failed'])}")
    if results["failed"]:
        print("\n### Failed Files\n")
        for f in results["failed"]:
            print(f"- **{f['file']}**: {f['error']}")

batch_convert("./documents", "./markdown_output")
```

### Bash one-liner (Linux/macOS)

```bash
find docs/ -type f \( -name "*.docx" -o -name "*.pdf" -o -name "*.pptx" \) \
  -exec sh -c 'markitdown "$1" > "${1%.*}.md"' _ {} \;
```

### PowerShell one-liner (Windows)

```powershell
Get-ChildItem -Path docs -Recurse -Include *.docx,*.pdf,*.pptx | ForEach-Object {
    $out = $_.FullName -replace '\.[^.]+$', '.md'
    markitdown $_.FullName | Set-Content $out -Encoding UTF8
}
```

# Tools Reference — Document to Markdown Converters

Detailed comparison of all tools referenced in the skill. Use this to decide which tool fits a specific scenario.

---

## Primary Tool

### markitdown (Microsoft)

- **Install**: `pip install markitdown` or `pip install 'markitdown[all]'`
- **Type**: Python library + CLI
- **License**: MIT
- **Repository**: https://github.com/microsoft/markitdown

**Supported formats**: .docx, .doc, .xlsx, .xls, .csv, .pptx, .ppt, .pdf, .html, .htm, .epub, .zip, .png/.jpg/.jpeg/.gif/.bmp/.tiff (OCR), .mp3/.wav/.m4a (transcription), .ipynb, .msg, .xml (RSS/ATOM feeds)

| Aspect | Detail |
|--------|--------|
| Strengths | Purpose-built for LLM consumption; single tool covers most Office formats; active Microsoft maintenance; CLI for quick use + Python API for integration |
| Weaknesses | OCR requires `[all]` extra deps; no Visio or .mpp support; table output can be rough for complex spreadsheets; limited control over output formatting |
| Best for | General-purpose document → Markdown conversion; batch processing; CI/CD pipelines |
| Avoid when | You need fine-grained control over table formatting, or the source is Visio/MS Project |

**CLI usage**:
```bash
markitdown input.docx > output.md
markitdown input.pdf > output.md
```

**Python API**:
```python
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("file.docx")
print(result.text_content)
```

---

## Word Document Tools

### mammoth (Node.js)

- **Install**: `npm install mammoth`
- **Type**: Node.js library + CLI
- **License**: BSD-2-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Excellent semantic HTML output from .docx; preserves document structure (headings, lists, tables) well; small and focused |
| Weaknesses | Only supports .docx (not .doc); outputs HTML by default (needs HTML→Markdown step); no other format support |
| Best for | .docx files with complex formatting where markitdown output is poor |
| Avoid when | You need anything other than .docx |

```bash
# CLI
npx mammoth file.docx --output-format=markdown > output.md
```

```javascript
const mammoth = require("mammoth");
const result = await mammoth.convertToMarkdown({ path: "file.docx" });
console.log(result.value);
```

### pandoc

- **Install**: System package (`apt install pandoc`, `brew install pandoc`, `choco install pandoc`)
- **Type**: Universal CLI tool (Haskell)
- **License**: GPL-2.0

| Aspect | Detail |
|--------|--------|
| Strengths | Supports 40+ input formats; highly configurable; excellent Markdown output; handles footnotes, citations, math |
| Weaknesses | System dependency (not pip-installable); no Python API; slower for batch processing; doesn't handle .xlsx/.pptx |
| Best for | High-quality .docx → Markdown conversion; formats with academic/technical content; when you need specific Markdown flavors (GFM, CommonMark) |
| Avoid when | You need to stay in Python-only toolchain; you need Excel/PowerPoint support |

```bash
pandoc -f docx -t gfm file.docx -o output.md
pandoc -f docx -t markdown --wrap=none file.docx -o output.md
```

### python-docx

- **Install**: `pip install python-docx`
- **Type**: Python library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Full programmatic access to .docx internals (paragraphs, tables, styles, images); fine-grained control |
| Weaknesses | No built-in Markdown output — you must build the conversion logic yourself; only .docx, not .doc |
| Best for | Custom extraction logic where you need specific parts of a document; metadata extraction |
| Avoid when | You just want text → Markdown (use markitdown or mammoth instead) |

---

## Excel / CSV Tools

### pandas

- **Install**: `pip install pandas tabulate openpyxl`
- **Type**: Python library
- **License**: BSD-3-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Excellent `.to_markdown()` method; handles multi-sheet workbooks; powerful data filtering/transformation before export; reads .xlsx, .xls, .csv, .tsv |
| Weaknesses | Heavy dependency for just conversion; requires `tabulate` for `.to_markdown()`; not a document converter — it's a data tool |
| Best for | Spreadsheets where you need to filter, transform, or select specific sheets/columns before Markdown output |
| Avoid when | You just need raw conversion (markitdown is simpler) |

```python
import pandas as pd
df = pd.read_excel("file.xlsx", sheet_name="Sheet1")
print(df.to_markdown(index=False))
```

### openpyxl

- **Install**: `pip install openpyxl`
- **Type**: Python library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Full access to Excel internals: cell values, formulas, styles, charts metadata; lightweight |
| Weaknesses | No Markdown output — manual conversion needed; only .xlsx (not .xls) |
| Best for | When you need to extract formulas, cell formatting, or specific named ranges |
| Avoid when | You just need a table dump (use pandas or markitdown) |

---

## PowerPoint Tools

### python-pptx

- **Install**: `pip install python-pptx`
- **Type**: Python library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Full access to slides, shapes, text frames, notes, images; structured extraction |
| Weaknesses | No Markdown output — manual conversion; only .pptx (not .ppt); no rendering of charts |
| Best for | Structured slide-by-slide extraction with titles, bullet points, and speaker notes |
| Avoid when | Simple text dump is enough (markitdown handles this) |

---

## PDF Tools

### PyMuPDF (fitz)

- **Install**: `pip install PyMuPDF`
- **Type**: Python library
- **License**: AGPL-3.0 (or commercial)

| Aspect | Detail |
|--------|--------|
| Strengths | Fast; preserves text positioning; can extract images; handles scanned PDFs (with OCR integration); page-level control |
| Weaknesses | AGPL license may be restrictive for commercial use; table extraction is basic |
| Best for | Large PDFs; PDFs with mixed content (text + images); when speed matters |
| Avoid when | You need excellent table extraction (use pdfplumber) or have AGPL concerns |

```python
import fitz  # PyMuPDF
doc = fitz.open("file.pdf")
for page in doc:
    print(page.get_text("text"))
```

### pdfplumber

- **Install**: `pip install pdfplumber`
- **Type**: Python library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Best-in-class table extraction from PDFs; precise text positioning; MIT license; visual debugging tools |
| Weaknesses | Slower than PyMuPDF; doesn't handle scanned/image PDFs; no OCR |
| Best for | PDFs with tables (financial reports, invoices, data sheets) |
| Avoid when | PDF is scanned/image-based (use PyMuPDF + OCR or markitdown[all]) |

```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        text = page.extract_text()
```

### pdf-parse (Node.js)

- **Install**: `npm install pdf-parse`
- **Type**: Node.js library
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | Simple API; fast; good for text-only PDFs |
| Weaknesses | No table extraction; no image handling; Node.js only |
| Best for | Quick text extraction from simple PDFs in Node.js projects |
| Avoid when | PDF has tables, images, or complex layouts |

---

## Visio Tools

There is no reliable open-source Visio-to-Markdown converter. All approaches involve intermediate conversions:

| Approach | Steps | Quality |
|----------|-------|---------|
| LibreOffice headless | `.vsdx` → PDF → markitdown | Medium — loses connector semantics |
| LibreOffice + OCR | `.vsdx` → PNG → markitdown[all] (OCR) | Low-Medium — text extraction only |
| Manual export | User exports as SVG/PDF from Visio → convert | Best available |
| PPTX export | User re-saves as .pptx → python-pptx | Medium — if diagram is simple |

**Recommendation**: Always ask the user if they can export from Visio directly. If automation is required, use LibreOffice headless as the first step.

---

## MS Project Tools

### mpxj

- **Install**: `pip install mpxj` (requires Java JDK + jpype1)
- **Type**: Java library with Python bindings
- **License**: LGPL-2.1

| Aspect | Detail |
|--------|--------|
| Strengths | Only reliable open-source .mpp reader; reads .mpp, .mpx, .mspdi (XML), Primavera formats |
| Weaknesses | Requires JVM; complex setup; Java-style API via jpype |
| Best for | Programmatic access to MS Project task data when export isn't possible |
| Avoid when | User can export to CSV/XML from MS Project (much simpler to parse) |

**Alternative**: Ask the user to export from MS Project as CSV or XML, then use markitdown (CSV) or xml.etree (XML).

---

## OCR Tools

### pytesseract

- **Install**: `pip install pytesseract` (requires Tesseract OCR engine installed on system)
- **Type**: Python wrapper for Tesseract OCR
- **License**: Apache-2.0

| Aspect | Detail |
|--------|--------|
| Strengths | Industry-standard OCR; supports 100+ languages; highly configurable; good accuracy on clean printed text |
| Weaknesses | Requires separate Tesseract binary install; poor on handwriting; needs image preprocessing for best results |
| Best for | High-volume image OCR; multi-language documents; when markitdown OCR quality is insufficient |
| Avoid when | markitdown `[all]` produces acceptable output; images contain handwriting |

```python
import pytesseract
from PIL import Image

text = pytesseract.image_to_string(Image.open("scan.png"))
print(text)
```

### EasyOCR

- **Install**: `pip install easyocr`
- **Type**: Python library (deep learning-based)
- **License**: Apache-2.0

| Aspect | Detail |
|--------|--------|
| Strengths | Better accuracy than Tesseract on noisy/low-quality images; supports 80+ languages; no system dependency — pure pip install |
| Weaknesses | Slower than Tesseract; large model downloads on first use; GPU recommended for speed |
| Best for | Low-quality scans; images with noise or unusual fonts; when Tesseract fails |
| Avoid when | Speed is critical; images are clean printed text (Tesseract is faster) |

```python
import easyocr

reader = easyocr.Reader(["en"])
results = reader.readtext("scan.png", detail=0)
print("\n".join(results))
```

---

## Audio Transcription Tools

### Whisper (OpenAI)

- **Install**: `pip install openai-whisper`
- **Type**: Python library (deep learning-based)
- **License**: MIT

| Aspect | Detail |
|--------|--------|
| Strengths | State-of-the-art accuracy; supports 99 languages; multiple model sizes (tiny → large); handles noisy audio well |
| Weaknesses | Slow on CPU (GPU strongly recommended); large model downloads; high memory usage for larger models |
| Best for | Meeting transcription; voice notes; any audio where accuracy matters |
| Avoid when | markitdown `[all]` transcription is acceptable; you need real-time transcription |

```python
import whisper

model = whisper.load_model("base")
result = model.transcribe("meeting.mp3")
print(result["text"])
```

```bash
# CLI usage
whisper meeting.mp3 --output_format txt --language en
```

### SpeechRecognition

- **Install**: `pip install SpeechRecognition`
- **Type**: Python library (wraps multiple engines)
- **License**: BSD-3-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Simple API; supports multiple backends (Google, Sphinx, Whisper); lightweight |
| Weaknesses | Online backends require internet; offline (Sphinx) has poor accuracy; limited audio format support without pydub |
| Best for | Quick transcription with online API access; prototyping |
| Avoid when | You need offline high-quality transcription (use Whisper); long audio files |

---

## Notebook Tools

### nbconvert

- **Install**: `pip install nbconvert` (often included with Jupyter)
- **Type**: Python library + CLI
- **License**: BSD-3-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Official Jupyter tool; full control over output (Markdown, HTML, PDF, LaTeX); template system for custom formatting |
| Weaknesses | Heavier dependency (pulls in Jupyter ecosystem); slower than markitdown for simple conversion |
| Best for | When you need fine-grained control over notebook output format; custom templates |
| Avoid when | markitdown output is acceptable (simpler, faster) |

```bash
jupyter nbconvert --to markdown notebook.ipynb
jupyter nbconvert --to markdown --no-input notebook.ipynb  # hide code cells
```

---

## Email Tools

### extract-msg

- **Install**: `pip install extract-msg`
- **Type**: Python library
- **License**: GPL-3.0

| Aspect | Detail |
|--------|--------|
| Strengths | Pure Python; extracts headers, body, and attachments from .msg files; saves attachments to disk |
| Weaknesses | GPL license; only handles .msg (not .eml); attachment content not auto-converted |
| Best for | When you need to extract and save attachments separately; when markitdown output is insufficient |
| Avoid when | markitdown handles the .msg file acceptably |

```python
import extract_msg

msg = extract_msg.Message("email.msg")
print(msg.subject, msg.sender, msg.body)
msg.save_attachments()  # saves to current dir
```

### python-oletools

- **Install**: `pip install oletools`
- **Type**: Python library
- **License**: BSD-2-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Analyzes OLE2 files (including .msg); security analysis capabilities; extracts metadata and embedded objects |
| Weaknesses | More of a forensic/security tool than a converter; low-level API |
| Best for | Security analysis of .msg files; extracting embedded OLE objects |
| Avoid when | You just need email text (use markitdown or extract-msg) |

---

## Feed Tools

### feedparser

- **Install**: `pip install feedparser`
- **Type**: Python library
- **License**: BSD-2-Clause

| Aspect | Detail |
|--------|--------|
| Strengths | Robust RSS/ATOM parsing; handles malformed feeds; normalizes feed data across formats |
| Weaknesses | No Markdown output — manual formatting needed; only for feeds, not arbitrary XML |
| Best for | When markitdown feed parsing is insufficient; when you need structured access to individual feed entries |
| Avoid when | markitdown handles the feed file acceptably |

```python
import feedparser

feed = feedparser.parse("feed.xml")
for entry in feed.entries:
    print(f"## {entry.title}\n")
    print(f"*{entry.published}*\n")
    print(entry.summary)
    print()
```

---

## Universal Fallbacks

### LibreOffice headless

- **Install**: System package (`apt install libreoffice`, `brew install --cask libreoffice`, or download)
- **Type**: CLI

Converts between many Office formats:
```bash
libreoffice --headless --convert-to docx file.doc
libreoffice --headless --convert-to pdf file.vsdx
libreoffice --headless --convert-to csv file.xlsx
```

| Aspect | Detail |
|--------|--------|
| Strengths | Handles almost every Office format; good conversion fidelity; batch capable |
| Weaknesses | Heavy install (~500MB+); slow startup; requires display server or `--headless`; output may differ from original |
| Best for | Legacy formats (.doc, .ppt, .xls, .vsd) that modern Python libs can't read directly |
| Avoid when | markitdown handles the format natively |

### textract (Python)

- **Install**: `pip install textract` (needs system deps)
- **Type**: Python library

| Aspect | Detail |
|--------|--------|
| Strengths | Unified API for many formats |
| Weaknesses | Unmaintained; complex system dependencies; installation often fails on modern systems |
| Best for | Avoid — use markitdown instead as the modern replacement |

---

## Decision Flowchart

1. **Is the format supported by markitdown?** → Yes → Use markitdown
2. **Is the output quality acceptable?** → Yes → Done
3. **No** → Check the fallback tool for that format in the mapping table
4. **Is it Visio or MS Project?** → Use the specific cascade documented in SKILL.md
5. **Is it a legacy format (.doc, .ppt, .xls)?** → Try markitdown first, then LibreOffice headless → modern format → markitdown

# Troubleshooting — Document to Markdown Conversion

Common issues encountered during document-to-Markdown conversion and their solutions.

---

## Installation Issues

### markitdown fails to install

**Symptom**: `pip install markitdown` fails with dependency errors.

**Solutions**:
1. Ensure Python 3.9+: `python --version`
2. Upgrade pip: `pip install --upgrade pip`
3. Install in a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   .venv\Scripts\activate     # Windows
   pip install markitdown
   ```
4. For `markitdown[all]` failures, install base first, then optional deps:
   ```bash
   pip install markitdown
   pip install 'markitdown[all]'
   ```

### OCR features not working

**Symptom**: Image-based content is not extracted; empty output for scanned PDFs or images.

**Solutions**:
1. Install with OCR support: `pip install 'markitdown[all]'`
2. Verify Tesseract is available: `tesseract --version`
3. On Windows, install Tesseract separately and add to PATH
4. On Linux: `apt install tesseract-ocr`
5. On macOS: `brew install tesseract`

### LibreOffice headless not found

**Symptom**: `libreoffice: command not found` or `'libreoffice' is not recognized`.

**Solutions**:
- Windows: Add LibreOffice to PATH, typically `C:\Program Files\LibreOffice\program\`
- Linux: `apt install libreoffice` or `snap install libreoffice`
- macOS: `brew install --cask libreoffice` then use `/Applications/LibreOffice.app/Contents/MacOS/soffice --headless`
- Docker: Use `libreoffice/libreoffice` image

---

## Encoding Issues

### Garbled characters in output

**Symptom**: Output contains `â€™`, `Ã©`, `â€"` or similar mojibake.

**Solutions**:
1. Ensure output is written as UTF-8:
   ```python
   Path("output.md").write_text(content, encoding="utf-8")
   ```
2. In CLI, redirect with encoding:
   ```bash
   markitdown file.docx | iconv -f utf-8 -t utf-8 > output.md
   ```
3. PowerShell: Set output encoding first:
   ```powershell
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   markitdown file.docx | Set-Content output.md -Encoding UTF8
   ```

### Non-Latin scripts (CJK, Arabic, Hebrew) missing

**Symptom**: Characters from non-Latin scripts are replaced with `?` or boxes.

**Solutions**:
1. markitdown generally handles Unicode well — verify the source file actually contains the text (open in original app)
2. For PDFs: CJK fonts may not be embedded. Try pdfplumber which handles font mapping better
3. For OCR: Install language packs for Tesseract:
   ```bash
   apt install tesseract-ocr-chi-sim  # Chinese Simplified
   apt install tesseract-ocr-jpn      # Japanese
   apt install tesseract-ocr-ara      # Arabic
   ```

---

## Format-Specific Issues

### Word: Tables not rendering correctly

**Symptom**: Word tables appear as flat text or lose column alignment.

**Solutions**:
1. Try mammoth for better table preservation:
   ```bash
   npx mammoth file.docx --output-format=markdown
   ```
2. Try pandoc:
   ```bash
   pandoc -f docx -t gfm --columns=120 file.docx -o output.md
   ```
3. For complex/nested tables: extract programmatically with python-docx and build Markdown tables manually

### Word: Images appear as empty references

**Symptom**: Output contains `![](image1.png)` but no actual image content.

**Solutions**:
1. Use `markitdown[all]` for OCR-based image descriptions
2. Use pandoc with `--extract-media`:
   ```bash
   pandoc -f docx -t gfm --extract-media=./media file.docx -o output.md
   ```
3. Accept that binary images can't be represented in Markdown text — describe their purpose in alt-text or skip

### Excel: Large spreadsheets produce unreadable output

**Symptom**: Markdown table is thousands of rows; columns are misaligned or too wide.

**Solutions**:
1. Limit rows with pandas:
   ```python
   df = pd.read_excel("file.xlsx")
   print(f"Total rows: {len(df)}\n")
   print(df.head(50).to_markdown(index=False))
   ```
2. Select specific columns:
   ```python
   cols = ["Name", "Date", "Amount"]
   print(df[cols].to_markdown(index=False))
   ```
3. Split into multiple tables by sheet:
   ```python
   sheets = pd.read_excel("file.xlsx", sheet_name=None)
   for name, df in sheets.items():
       print(f"## {name}\n{df.head(100).to_markdown(index=False)}\n")
   ```

### Excel: Formulas instead of values

**Symptom**: Cells show formulas like `=SUM(A1:A10)` instead of computed values.

**Solutions**:
1. markitdown and pandas both read computed values by default — this usually means the workbook was saved without recalculating
2. Open in Excel, press Ctrl+Shift+F9 to recalculate, save, then convert
3. With openpyxl, explicitly request data_only:
   ```python
   from openpyxl import load_workbook
   wb = load_workbook("file.xlsx", data_only=True)
   ```

### PowerPoint: Slide layout lost / text is flat

**Symptom**: All text from a slide is dumped in one block without structure.

**Solutions**:
1. Use python-pptx for structured extraction (see examples.md)
2. Accept that spatial layout can't map to linear Markdown — focus on extracting the semantic content (titles, bullets, notes)
3. Include speaker notes which often contain the slide's narrative

### PDF: Scanned/image-based PDFs produce empty output

**Symptom**: markitdown returns blank or very little text from a PDF.

**Solutions**:
1. The PDF is likely image-based (scanned). Install OCR:
   ```bash
   pip install 'markitdown[all]'
   ```
2. Use PyMuPDF with OCR:
   ```python
   import fitz
   doc = fitz.open("scanned.pdf")
   for page in doc:
       # Try text extraction first
       text = page.get_text("text")
       if not text.strip():
           # Fall back to OCR
           pix = page.get_pixmap(dpi=300)
           # Save image and OCR externally
   ```
3. For high-volume scanned PDFs, consider a dedicated OCR service

### PDF: Tables are broken or columns merged

**Symptom**: Table data runs together; columns are not separated correctly.

**Solutions**:
1. Use pdfplumber — it has the best table detection:
   ```python
   import pdfplumber
   with pdfplumber.open("file.pdf") as pdf:
       for page in pdf.pages:
           for table in page.extract_tables():
               print(table)
   ```
2. Adjust pdfplumber's table settings:
   ```python
   table_settings = {
       "vertical_strategy": "text",
       "horizontal_strategy": "text",
       "snap_tolerance": 5,
   }
   tables = page.extract_tables(table_settings)
   ```
3. As last resort: use Tabula (`pip install tabula-py`, requires Java) which uses a different extraction algorithm

---

## Performance Issues

### Conversion is very slow for large files

**Symptom**: Converting a 100+ page document or 50MB+ file takes minutes.

**Solutions**:
1. For PDFs, use PyMuPDF (fastest Python PDF library):
   ```python
   import fitz
   doc = fitz.open("large.pdf")
   for page in doc:
       print(page.get_text("text"))
   ```
2. For Excel, use specific sheets/ranges instead of loading everything:
   ```python
   df = pd.read_excel("large.xlsx", sheet_name="Summary", usecols="A:E", nrows=1000)
   ```
3. Process in chunks — convert N pages/sheets at a time
4. For batch processing, use multiprocessing:
   ```python
   from concurrent.futures import ProcessPoolExecutor
   from markitdown import MarkItDown

   def convert_one(path):
       md = MarkItDown()
       return md.convert(str(path)).text_content

   with ProcessPoolExecutor(max_workers=4) as pool:
       results = pool.map(convert_one, file_list)
   ```

### Out of memory on large files

**Symptom**: Python process killed or MemoryError.

**Solutions**:
1. Process page-by-page instead of loading entire document
2. For Excel: use `openpyxl` in read-only mode:
   ```python
   from openpyxl import load_workbook
   wb = load_workbook("huge.xlsx", read_only=True)
   ```
3. For PDFs: process one page at a time with PyMuPDF (it's already memory-efficient)
4. Increase system swap space for truly massive files

---

## Corrupted or Protected Files

### Password-protected files

**Symptom**: `InvalidFileException`, `PasswordRequired`, or empty output.

**Solutions**:
1. markitdown does not handle encryption — file must be decrypted first
2. For PDFs with known password:
   ```bash
   qpdf --password=SECRET --decrypt protected.pdf decrypted.pdf
   markitdown decrypted.pdf > output.md
   ```
3. For Office files: open in the respective app, remove protection, re-save
4. With `msoffcrypto-tool` for Office files:
   ```bash
   pip install msoffcrypto-tool
   msoffcrypto-tool -p PASSWORD encrypted.docx decrypted.docx
   ```

### Corrupted files

**Symptom**: `BadZipFile`, `Invalid file format`, or similar errors.

**Solutions**:
1. Verify the file opens in its native application
2. Try LibreOffice headless repair:
   ```bash
   libreoffice --headless --infilter="Microsoft Word 2007-2019 XML" --convert-to docx corrupted.docx
   ```
3. For ZIP-based formats (.docx, .xlsx, .pptx): try extracting content.xml manually:
   ```python
   import zipfile
   with zipfile.ZipFile("corrupted.docx") as z:
       z.printdir()  # See what's inside
   ```
4. Accept that severely corrupted files may not be recoverable

---

## Output Quality

### Excessive whitespace in output

**Solution**: Post-process the Markdown:
```python
import re

def clean_markdown(text: str) -> str:
    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip trailing whitespace per line
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return text.strip() + "\n"
```

### Heading levels are inconsistent

**Solution**: Normalize heading hierarchy:
```python
import re

def normalize_headings(text: str) -> str:
    headings = re.findall(r"^(#{1,6})\s", text, re.MULTILINE)
    if not headings:
        return text
    min_level = min(len(h) for h in headings)
    offset = min_level - 1
    if offset > 0:
        text = re.sub(
            r"^(#{1,6})(\s)",
            lambda m: "#" * (len(m.group(1)) - offset) + m.group(2),
            text,
            flags=re.MULTILINE,
        )
    return text
```

### Converted content is too long for LLM context

**Solution**: Summarize or chunk the output:
1. Split by sections/headings and process individually
2. Extract only key sections (ToC, summary, specific pages)
3. For Excel: include only column headers + first few rows as a schema
4. For PowerPoint: extract slide titles + first bullet only for an outline