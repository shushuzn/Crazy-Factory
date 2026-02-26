#!/usr/bin/env python3
"""Append a standard iteration block to docs/roadmaps/ROLLING_UPDATE_LOG.md."""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True, help="Iteration ID, e.g. F")
    parser.add_argument("--goal", required=True, help="Iteration goal")
    parser.add_argument("--changes", required=True, help="Main changes summary")
    parser.add_argument("--checks", required=True, help="Validation commands summary")
    parser.add_argument("--rollback", required=True, help="Rollback point")
    parser.add_argument(
        "--file",
        default="docs/roadmaps/ROLLING_UPDATE_LOG.md",
        help="Rolling log path",
    )
    args = parser.parse_args()

    path = Path(args.file)
    text = path.read_text(encoding="utf-8")
    marker = "## 模板（后续复用）"
    block = (
        f"\n## {date.today().isoformat()} / Iteration {args.id}\n"
        f"- 目标：{args.goal}\n"
        f"- 改动：{args.changes}\n"
        f"- 校验：{args.checks}\n"
        f"- 回滚点：{args.rollback}\n"
    )

    if block in text:
        print("iteration block already exists")
        return 0

    if marker not in text:
        raise SystemExit(f"marker not found in {path}")

    path.write_text(text.replace(marker, block + "\n" + marker), encoding="utf-8")
    print(f"added Iteration {args.id} to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
