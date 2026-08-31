#!/usr/bin/env bash
set -euo pipefail

topic="${1:-Model 4090 behavior}"
codex exec --sandbox read-only "Research this project topic using authoritative primary sources only: ${topic}"
