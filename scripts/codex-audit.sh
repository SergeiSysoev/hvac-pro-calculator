#!/usr/bin/env bash
set -euo pipefail

target="${1:-.}"
codex exec --sandbox read-only "Perform one direct, independent code review of ${target} and its dependencies. Do not invoke /audit, do not run codex-audit.sh, do not spawn agents, and do not edit files. Check calculator correctness, dimensional math, ASHRAE duct formulas, swipe behavior, edge cases, accessibility, security, and divergence from documented public behavior. Report CRITICAL, MEDIUM, and MINOR findings with file and line references, then stop."
