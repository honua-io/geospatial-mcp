#!/usr/bin/env python3
"""Reject AI/agent attribution in commit messages and PR bodies.

Enforces AGENTS.md rule 3 ("Commit hygiene — no agent attribution") going
forward, so the policy is checked mechanically instead of by convention. It
flags, case-insensitively:

  * `Co-Authored-By:` trailers naming an AI/bot co-author (Claude, Codex,
    Copilot, ChatGPT/GPT, Anthropic, OpenAI, Gemini, Llama, Cursor, Devin,
    Cody, …) or a `[bot]` / bot-noreply address;
  * "Generated with / by <AI tool>" lines (e.g. "Generated with Claude Code");
  * the robot emoji (🤖).

Historical commits already on the published history are intentionally left
as-is (AGENTS.md): this checker only scans the commits a change *introduces*
(a commit-range or a single commit message) plus an optional PR-body text, so
it never re-fails the existing history.

Usage:
    # CI: scan the commits a PR introduces + the PR body
    python3 tools/check_attribution.py --range "$BASE_SHA..$HEAD_SHA" --body-env PR_BODY

    # commit-msg hook: scan the message being committed
    python3 tools/check_attribution.py --commit-msg-file "$1"

    # scan literal text
    python3 tools/check_attribution.py --text "some message"

Exit code 0 = clean; 1 = at least one violation; 2 = usage/git error.
"""
import argparse
import os
import re
import subprocess
import sys

# AI/agent product and vendor markers that must not appear as a co-author or in
# a "generated with/by" attribution line.
AI_MARKERS = (
    r"claude|anthropic|codex|openai|chatgpt|gpt-?\d|copilot|gemini|"
    r"google bard|\bbard\b|llama|mistral|cursor|\bdevin\b|sourcegraph|\bcody\b|"
    r"claude code|github copilot"
)

CO_AUTHOR_RE = re.compile(
    r"(?im)^\s*co-authored-by:\s*.*(?:" + AI_MARKERS + r"|\[bot\]|"
    r"bot@|noreply@anthropic|noreply@openai).*$"
)
GENERATED_RE = re.compile(
    r"(?im)^.*generated\s+(?:with|by)\s+.*(?:" + AI_MARKERS + r").*$"
)
ROBOT_EMOJI_RE = re.compile("🤖")

CHECKS = (
    ("AI/bot Co-Authored-By trailer", CO_AUTHOR_RE),
    ("'Generated with/by <AI tool>' attribution", GENERATED_RE),
    ("robot emoji (🤖)", ROBOT_EMOJI_RE),
)


def scan(label, text, violations):
    """Append (source, description, line) tuples for every match in text."""
    if not text:
        return
    for desc, pattern in CHECKS:
        for m in pattern.finditer(text):
            snippet = m.group(0).strip().splitlines()[0] if m.group(0).strip() else m.group(0)
            violations.append((label, desc, snippet[:200]))


def commit_messages(rev_range):
    """Yield (sha, message) for each commit in rev_range."""
    sep = "\x1e"
    fmt = "%H%x1f%B"
    try:
        out = subprocess.check_output(
            ["git", "log", f"--format={fmt}{sep}", rev_range],
            text=True, encoding="utf-8",
        )
    except subprocess.CalledProcessError as exc:
        print(f"check_attribution: git log failed for range '{rev_range}': {exc}",
              file=sys.stderr)
        sys.exit(2)
    for record in out.split(sep):
        record = record.strip("\n")
        if not record:
            continue
        sha, _, body = record.partition("\x1f")
        yield sha[:12], body


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--range", dest="rev_range",
                        help="git commit range to scan, e.g. BASE..HEAD")
    parser.add_argument("--commit-msg-file",
                        help="path to a single commit message file (commit-msg hook)")
    parser.add_argument("--text", help="literal text to scan")
    parser.add_argument("--body-env",
                        help="name of an env var whose value is also scanned (e.g. a PR body)")
    args = parser.parse_args(argv)

    violations = []

    if args.rev_range:
        for sha, body in commit_messages(args.rev_range):
            scan(f"commit {sha}", body, violations)

    if args.commit_msg_file:
        try:
            with open(args.commit_msg_file, "r", encoding="utf-8") as fh:
                scan(f"message {os.path.basename(args.commit_msg_file)}", fh.read(), violations)
        except OSError as exc:
            print(f"check_attribution: cannot read {args.commit_msg_file}: {exc}",
                  file=sys.stderr)
            return 2

    if args.text:
        scan("text", args.text, violations)

    if args.body_env:
        scan("PR body", os.environ.get(args.body_env, ""), violations)

    if not (args.rev_range or args.commit_msg_file or args.text or args.body_env):
        parser.print_usage(sys.stderr)
        print("check_attribution: nothing to scan (pass --range/--commit-msg-file/"
              "--text/--body-env)", file=sys.stderr)
        return 2

    if violations:
        print("AI/agent attribution is not allowed (AGENTS.md rule 3). Found:",
              file=sys.stderr)
        for source, desc, snippet in violations:
            print(f"  - {source}: {desc}\n      {snippet}", file=sys.stderr)
        print("\nRemove the attribution and re-commit (author as the repo owner "
              "only). Existing published history is exempt; this checks only the "
              "commits/PR body this change introduces.", file=sys.stderr)
        return 1

    print("check_attribution: OK (no AI/agent attribution found).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
