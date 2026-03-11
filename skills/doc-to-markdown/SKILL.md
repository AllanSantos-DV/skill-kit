---
name: doc-to-markdown
description: "Convert binary/Office documents to Markdown for LLM consumption. USE FOR: converting Word, Excel, PowerPoint, PDF, Visio, MS Project files to Markdown, batch document conversion, extracting text from non-readable formats. DO NOT USE FOR: Markdown formatting/linting, general file I/O, web scraping, image generation."
argument-hint: Describe the file format(s) you need converted to Markdown
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

## Standalone Scripts

This skill includes ready-to-run Python scripts in the `scripts/` directory. When the user needs conversion, **execute these directly** via `run_in_terminal` instead of generating code from scratch.

| Script | Purpose | Quick Usage |
|--------|---------|-------------|
| `convert.py` | Single file → Markdown | `python scripts/convert.py file.docx -o output.md` |
| `batch_convert.py` | Entire directory → Markdown | `python scripts/batch_convert.py ./docs -o ./md_output -r` |
| `extract_tables.py` | Tables from PDF/Excel → Markdown | `python scripts/extract_tables.py report.pdf` |

All scripts accept `--help` for full usage. Paths are passed as parameters — never hardcoded.

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
| MS Project | .mpp | _not supported_ | mpxj (Java + jpype), or export to XML/CSV from MS Project |
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

#### MS Project (.mpp)

No Python-native converter. Options:

1. **mpxj** (Java library with Python bindings):
   ```bash
   pip install mpxj
   ```
   ```python
   import jpype
   from net.sf.mpxj.reader import UniversalProjectReader

   reader = UniversalProjectReader()
   project = reader.read("file.mpp")
   for task in project.getTasks():
       print(f"- **{task.getName()}** | Start: {task.getStart()} | End: {task.getFinish()} | Duration: {task.getDuration()}")
   ```
   Note: mpxj requires a JVM. Install Java JDK and jpype1 (`pip install jpype1`).

2. **Export-based**: Ask the user to export from MS Project as XML or CSV, then parse:
   ```bash
   # If exported as CSV
   markitdown project.csv > output.md
   ```

3. **XML parse**: If exported as MS Project XML:
   ```python
   import xml.etree.ElementTree as ET

   tree = ET.parse("project.xml")
   root = tree.getroot()
   ns = {"ms": "http://schemas.microsoft.com/project"}
   for task in root.findall(".//ms:Task", ns):
       name = task.findtext("ms:Name", default="", namespaces=ns)
       start = task.findtext("ms:Start", default="", namespaces=ns)
       finish = task.findtext("ms:Finish", default="", namespaces=ns)
       print(f"- **{name}** | {start} → {finish}")
   ```

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
