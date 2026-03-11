"""
Convert a single document to Markdown for LLM consumption.

Usage:
    python convert.py document.docx                    # prints to stdout
    python convert.py document.docx -o output.md       # saves to file
    python convert.py report.pdf --tool pdfplumber      # force specific tool
    python convert.py scan.png --ocr                    # OCR mode
    python convert.py file.docx --no-frontmatter        # skip YAML header

Supported formats: .docx, .doc, .xlsx, .xls, .csv, .pptx, .ppt, .pdf, .html, .epub, .png, .jpg, .jpeg, .gif, .bmp, .tiff, .mp3, .wav, .m4a, .ipynb, .zip, .msg
Requires: pip install markitdown (or pip install 'markitdown[all]' for OCR)
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

SUPPORTED_EXTENSIONS = {
    ".docx", ".doc", ".xlsx", ".xls", ".csv",
    ".pptx", ".ppt", ".pdf", ".html", ".htm", ".epub",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff",
    ".mp3", ".wav", ".m4a",
    ".ipynb", ".zip", ".msg",
}

TOOL_CHOICES = ["markitdown", "pandoc", "pdfplumber", "mammoth"]


def convert_markitdown(input_path: Path, *, enable_ocr: bool = False) -> str:
    try:
        from markitdown import MarkItDown
    except ImportError:
        pkg = "'markitdown[all]'" if enable_ocr else "markitdown"
        print(f"Error: markitdown is not installed. Run: pip install {pkg}", file=sys.stderr)
        sys.exit(1)

    kwargs: dict = {}
    if enable_ocr:
        try:
            kwargs["enable_llm_extraction"] = False  # OCR only, no LLM
        except Exception:
            pass

    md = MarkItDown(**kwargs)
    result = md.convert(str(input_path))
    return result.text_content


def convert_pdfplumber(input_path: Path) -> str:
    try:
        import pdfplumber
    except ImportError:
        print("Error: pdfplumber is not installed. Run: pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    parts: list[str] = []
    with pdfplumber.open(str(input_path)) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            parts.append(f"## Page {i}\n")
            text = page.extract_text()
            if text:
                parts.append(text + "\n")
            tables = page.extract_tables()
            for table in tables:
                if not table or not table[0]:
                    continue
                header = "| " + " | ".join(str(c or "") for c in table[0]) + " |"
                sep = "| " + " | ".join("---" for _ in table[0]) + " |"
                rows = "\n".join(
                    "| " + " | ".join(str(c or "") for c in row) + " |"
                    for row in table[1:]
                )
                parts.append(f"{header}\n{sep}\n{rows}\n")
    return "\n".join(parts)


def convert_pandoc(input_path: Path) -> str:
    import subprocess

    try:
        result = subprocess.run(
            ["pandoc", "-f", _pandoc_format(input_path), "-t", "markdown", str(input_path)],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("Error: pandoc is not installed. See https://pandoc.org/installing.html", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: pandoc failed: {e.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def _pandoc_format(path: Path) -> str:
    mapping = {
        ".docx": "docx", ".doc": "doc", ".html": "html", ".htm": "html",
        ".epub": "epub", ".csv": "csv", ".pptx": "pptx",
    }
    return mapping.get(path.suffix.lower(), "")


def convert_mammoth(input_path: Path) -> str:
    try:
        import mammoth
    except ImportError:
        print("Error: mammoth is not installed. Run: pip install mammoth", file=sys.stderr)
        sys.exit(1)

    with open(input_path, "rb") as f:
        result = mammoth.convert_to_markdown(f)
    if result.messages:
        for msg in result.messages:
            print(f"Warning: {msg}", file=sys.stderr)
    return result.value


def build_frontmatter(input_path: Path) -> str:
    source = input_path.name
    date = datetime.now().strftime("%Y-%m-%d")
    fmt = input_path.suffix.lstrip(".").lower()
    return f'---\nsource: "{source}"\nconverted: "{date}"\nformat: "{fmt}"\n---\n\n'


def detect_tool(input_path: Path) -> str:
    return "markitdown"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a single document to Markdown for LLM consumption."
    )
    parser.add_argument("input", help="Path to the source file")
    parser.add_argument("-o", "--output", help="Output .md path (default: stdout)")
    parser.add_argument(
        "--no-frontmatter", action="store_true", help="Skip YAML frontmatter generation"
    )
    parser.add_argument(
        "-t", "--tool", choices=TOOL_CHOICES,
        help="Force a specific conversion tool (default: auto-detect)",
    )
    parser.add_argument(
        "--ocr", action="store_true",
        help="Enable OCR for images/scanned documents (requires markitdown[all])",
    )
    args = parser.parse_args()

    input_path = Path(args.input).resolve()

    if not input_path.is_file():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    ext = input_path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS and not args.ocr:
        print(
            f"Error: unsupported format '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
            file=sys.stderr,
        )
        sys.exit(1)

    tool = args.tool or detect_tool(input_path)

    converters = {
        "markitdown": lambda: convert_markitdown(input_path, enable_ocr=args.ocr),
        "pdfplumber": lambda: convert_pdfplumber(input_path),
        "pandoc": lambda: convert_pandoc(input_path),
        "mammoth": lambda: convert_mammoth(input_path),
    }

    try:
        content = converters[tool]()
    except Exception as e:
        print(f"Error during conversion: {e}", file=sys.stderr)
        sys.exit(1)

    if not args.no_frontmatter:
        content = build_frontmatter(input_path) + content

    if args.output:
        output_path = Path(args.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(content, encoding="utf-8")
        print(f"Saved: {output_path}")
    else:
        sys.stdout.write(content)


if __name__ == "__main__":
    main()
