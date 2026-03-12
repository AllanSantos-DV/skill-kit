"""
Generate an MSPDI XML file (MS Project) from JSON input.

Usage:
    python generate_project.py input.json -o output.xml
    python generate_project.py input.json -o output.xml --java-home "C:\\Program Files\\Java\\jdk-17"

Input format (JSON):
    {
      "tasks": [
        {
          "name": "Task Name",
          "start": "2026-04-01",
          "duration": "5d",
          "predecessors": [1],
          "resources": ["PM"]
        }
      ]
    }

Duration formats: "5d" (days), "8h" (hours), "2w" (weeks)
Predecessors: 1-based index into the tasks array.

Requires: pip install mpxj  (and Java 11+)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def _ensure_package(import_name: str, pip_name: str | None = None) -> bool:
    """Try to import a package; auto-install if non-interactive. Returns True if available."""
    pip_name = pip_name or import_name
    try:
        __import__(import_name)
        return True
    except (ImportError, OSError):
        pass

    if sys.stdin.isatty():
        answer = input(f'Package "{pip_name}" is not installed. Install it now? [Y/n] ').strip().lower()
        if answer in ("", "y", "yes"):
            subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])
            return True
        return False
    else:
        print(f"Auto-installing missing package: {pip_name}", file=sys.stderr)
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])
        __import__(import_name)  # verify
        return True


def check_java(min_version: int = 11, java_home: str | None = None) -> str | None:
    """Check if Java is available and meets the minimum version. Returns java path or None."""
    # Try runtime_resolver if available
    resolver = Path(__file__).parent / "runtime_resolver.py"
    if resolver.is_file():
        extra = []
        if java_home:
            extra = ["--extra-paths", java_home]
        try:
            result = subprocess.run(
                [sys.executable, str(resolver), "java",
                 "--min-version", str(min_version)] + extra,
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                import json as _json
                info = _json.loads(result.stdout)
                if info.get("found"):
                    return info.get("path")
        except Exception:
            pass

    # Direct check
    java_cmd = "java"
    if java_home:
        candidate = Path(java_home) / "bin" / "java"
        if candidate.is_file():
            java_cmd = str(candidate)
        candidate_exe = Path(java_home) / "bin" / "java.exe"
        if candidate_exe.is_file():
            java_cmd = str(candidate_exe)

    try:
        result = subprocess.run(
            [java_cmd, "-version"],
            capture_output=True, text=True, timeout=10
        )
        # Java outputs version to stderr
        output = result.stderr or result.stdout
        if output:
            return java_cmd
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return None


def load_input(input_path: Path) -> list[dict]:
    """Load and validate JSON input."""
    text = input_path.read_text(encoding="utf-8")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {input_path}: {e}", file=sys.stderr)
        sys.exit(1)
    if "tasks" not in data:
        print("Error: JSON must have a 'tasks' key.", file=sys.stderr)
        sys.exit(1)
    return data["tasks"]


def parse_duration(dur_str: str) -> tuple[float, str]:
    """Parse duration string like '5d', '8h', '2w' into (value, unit)."""
    dur_str = dur_str.strip().lower()
    if dur_str.endswith("w"):
        return float(dur_str[:-1]) * 5, "DAYS"
    elif dur_str.endswith("h"):
        return float(dur_str[:-1]), "HOURS"
    elif dur_str.endswith("d"):
        return float(dur_str[:-1]), "DAYS"
    else:
        try:
            return float(dur_str), "DAYS"
        except ValueError:
            print(f"Warning: Cannot parse duration '{dur_str}', defaulting to 1 day.", file=sys.stderr)
            return 1.0, "DAYS"


def _resolve_java_home(java_path: str) -> Path | None:
    """Resolve the actual JAVA_HOME from a java executable path.

    Handles symlinks, Oracle shims, and non-standard paths by querying
    the Java process for its java.home property as a fallback.
    """
    resolved = Path(java_path).resolve()
    # Standard JDK layout: <JAVA_HOME>/bin/java[.exe]
    if resolved.parent.name.lower() == "bin":
        return resolved.parent.parent

    # Non-standard path (e.g., Oracle shim) — ask Java itself
    try:
        result = subprocess.run(
            [java_path, "-XshowSettings:properties", "-version"],
            capture_output=True, text=True, timeout=10,
        )
        for line in (result.stderr or "").splitlines():
            if "java.home" in line and "=" in line:
                return Path(line.split("=", 1)[1].strip())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def _find_jvm_dll(jdk_home: Path) -> str | None:
    """Locate the JVM shared library inside a JDK home directory."""
    if sys.platform == "win32":
        candidates = [
            jdk_home / "bin" / "server" / "jvm.dll",
            jdk_home / "bin" / "client" / "jvm.dll",
        ]
    elif sys.platform == "darwin":
        candidates = [
            jdk_home / "lib" / "server" / "libjvm.dylib",
            jdk_home / "lib" / "client" / "libjvm.dylib",
        ]
    else:
        candidates = [
            jdk_home / "lib" / "server" / "libjvm.so",
            jdk_home / "lib" / "client" / "libjvm.so",
        ]

    for c in candidates:
        if c.is_file():
            return str(c)
    return None


def generate(tasks_data: list[dict], output_path: Path, java_path: str) -> None:
    """Generate MSPDI XML using MPXJ."""
    # Resolve the actual JDK home and JVM library path
    jdk_home = _resolve_java_home(java_path)
    jvm_path = _find_jvm_dll(jdk_home) if jdk_home else None

    # Set JAVA_HOME so mpxj/jpype internals can use it
    if jdk_home:
        os.environ["JAVA_HOME"] = str(jdk_home)

    if not _ensure_package("mpxj"):
        print("Error: mpxj is required.", file=sys.stderr)
        sys.exit(1)
    if not _ensure_package("jpype", "jpype1"):
        print("Error: jpype1 is required.", file=sys.stderr)
        sys.exit(1)

    import mpxj  # noqa: F401 — adds MPXJ jars to classpath
    import jpype
    try:
        if not jpype.isJVMStarted():
            if jvm_path:
                jpype.startJVM(jvm_path)
            else:
                jpype.startJVM()
    except Exception as e:
        print(f"Error starting JVM: {e}", file=sys.stderr)
        print("Ensure JAVA_HOME is set correctly or pass --java-home.", file=sys.stderr)
        sys.exit(1)

    try:
        from org.mpxj import ProjectFile, Duration, TimeUnit, Relation
        from org.mpxj.mspdi import MSPDIWriter
        from java.time import LocalDateTime
    except Exception:
        print("Error: Failed to load MPXJ Java classes. Ensure mpxj and jpype1 are installed.", file=sys.stderr)
        sys.exit(1)

    project = ProjectFile()

    created_tasks = []
    for task_data in tasks_data:
        task = project.addTask()
        task.setName(task_data["name"])

        if task_data.get("start"):
            parts = task_data["start"].split("-")
            task.setStart(LocalDateTime.of(int(parts[0]), int(parts[1]), int(parts[2]), 8, 0))

        if task_data.get("duration"):
            dur_val, dur_unit = parse_duration(task_data["duration"])
            unit = TimeUnit.DAYS if dur_unit == "DAYS" else TimeUnit.HOURS
            task.setDuration(Duration.getInstance(dur_val, unit))

        created_tasks.append(task)

    # Set predecessors (1-based index) using Relation.Builder
    for i, task_data in enumerate(tasks_data):
        for pred_idx in task_data.get("predecessors", []):
            if 0 < pred_idx <= len(created_tasks):
                builder = Relation.Builder()
                builder.predecessorTask(created_tasks[pred_idx - 1])
                builder.successorTask(created_tasks[i])
                created_tasks[i].addPredecessor(builder)

    # Add resources
    resource_map: dict[str, object] = {}
    for i, task_data in enumerate(tasks_data):
        for res_name in task_data.get("resources", []):
            if res_name not in resource_map:
                resource = project.addResource()
                resource.setName(res_name)
                resource_map[res_name] = resource

    # Assign resources to tasks (addResourceAssignment is on Task, not ProjectFile)
    for i, task_data in enumerate(tasks_data):
        for res_name in task_data.get("resources", []):
            if res_name in resource_map:
                created_tasks[i].addResourceAssignment(resource_map[res_name])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = MSPDIWriter()
    writer.write(project, str(output_path))
    print(f"Generated: {output_path} ({len(created_tasks)} tasks, MSPDI XML format)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate an MSPDI XML file (MS Project) from JSON input."
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Path to JSON input file with task definitions."
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=Path("output.xml"),
        help="Output file path (default: output.xml)."
    )
    parser.add_argument(
        "--java-home",
        type=str,
        default=None,
        help="Path to Java JDK installation (e.g., 'C:\\Program Files\\Java\\jdk-17')."
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Check Java availability
    java_path = check_java(min_version=11, java_home=args.java_home)
    if not java_path:
        print("Error: Java 11+ is required but was not found.", file=sys.stderr)
        print("", file=sys.stderr)
        print("Install Java:", file=sys.stderr)
        print("  Windows: choco install temurin17", file=sys.stderr)
        print("  Linux:   apt install openjdk-17-jdk", file=sys.stderr)
        print("  macOS:   brew install openjdk@17", file=sys.stderr)
        print("", file=sys.stderr)
        print("Or pass --java-home to specify the JDK location.", file=sys.stderr)
        sys.exit(1)

    tasks_data = load_input(args.input)
    generate(tasks_data, args.output, java_path)


if __name__ == "__main__":
    main()
