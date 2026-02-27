#!/usr/bin/env bash
set -euo pipefail

PASS_CMD=(node scripts/run_soak_check.js --seconds 120 --max-writes-std 2)
FAIL_CMD=(node scripts/run_soak_check.js --seconds 10)

echo "[soak-threshold] expecting pass (exit 0): ${PASS_CMD[*]}"
"${PASS_CMD[@]}"

echo "[soak-threshold] expecting fail (exit 1): ${FAIL_CMD[*]}"
set +e
"${FAIL_CMD[@]}"
status=$?
set -e

if [[ $status -ne 1 ]]; then
  echo "[soak-threshold] expected exit 1, got ${status}" >&2
  exit 1
fi

echo "[soak-threshold] pass/fail paths verified (0 and 1)."
