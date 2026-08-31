#!/usr/bin/env bash
set -euo pipefail

target="${1:-.}"
codex exec --sandbox read-only "Audit ${target} in this repository. Check calculator correctness, dimensional math, edge cases, accessibility, security, and divergence from the documented Model 4090 behavior. Report CRITICAL, MEDIUM, and MINOR findings with file and line references. Do not edit files."
