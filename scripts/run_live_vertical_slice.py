from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Explicit Tian-wen live experiment; never run under pytest.")
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, required=True)
    parser.add_argument("--live-web", action="store_true")
    parser.add_argument("--domain", action="append", default=[])
    parser.add_argument("--max-searches", type=int, default=1)
    parser.add_argument("--max-fetches", type=int, default=1)
    args = parser.parse_args()
    has_provider_key = any(os.environ.get(name) for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"))
    if not os.environ.get("TIANWEN_MODEL") or not has_provider_key:
        parser.error("TIANWEN_MODEL and provider credentials are required in the environment")
    if args.live_web and not args.domain:
        parser.error("--live-web requires --domain")
    workspace = args.workspace.resolve()
    inside = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"], cwd=workspace, capture_output=True, text=True
    )
    clean = subprocess.run(["git", "status", "--porcelain"], cwd=workspace, capture_output=True, text=True)
    git_file = workspace / ".git"
    disposable = git_file.is_file() or "tianwen-smoke" in workspace.name
    if inside.stdout.strip() != "true" or clean.stdout.strip() or not disposable:
        parser.error("workspace must be a clean disposable Git worktree (.git file or a tianwen-smoke path)")
    print("Live experiment prepared. Network is " + ("enabled" if args.live_web else "disabled") + ".")
    print("Run CLI goal-create, explore, run, eval-request, external evaluator, eval-import, then promote manually.")
    print("Final label must be one of: supported, limited, refuted, inconclusive. A single run is only a sample.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
