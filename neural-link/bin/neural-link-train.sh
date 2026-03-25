#!/usr/bin/env bash
# Neural Link Training CLI — shell wrapper
# Usage: neural-link-train.sh --handler=<name> --reward=<0.0-1.0> [--session=<id>] [--context=<json>]
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
node "$PROJECT_DIR/src/train.js" "$@"
