#!/usr/bin/env bash
set -euo pipefail

topic="${1:-professional HVAC calculator behavior}"
codex exec --sandbox read-only "Research this project topic using authoritative primary sources only: ${topic}"
