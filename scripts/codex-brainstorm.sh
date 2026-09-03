#!/usr/bin/env bash
set -euo pipefail

topic="${1:-calculator improvement}"
codex exec --sandbox read-only "Brainstorm scoped improvements for ${topic}. Do not edit files. Preserve verified HVAC field workflows and ASHRAE engineering behavior."
