#!/usr/bin/env python3
"""Internal relative-link checker for the geospatial-mcp Markdown spec.

Validates Markdown links `[text](target)` whose target is a *relative* path
(external `http(s)`/`mailto`, the `honua://` resource scheme, and data URIs are
intentionally skipped). For every such link it checks:

  1. the target file resolves on disk relative to the linking file, and
  2. when the link carries a `#fragment`, that the fragment resolves to a real
     heading anchor in the target file (or in the same file for pure `#anchor`
     links).

Heading anchors are computed with the GitHub slug algorithm (the same one
GitHub renders for in-page navigation), including the `-1`, `-2` suffixes
GitHub appends to duplicate headings. Headings inside fenced code blocks are
ignored. This closes the gap where the previous CI check stripped `#fragment`
and only verified the target file existed, so heading drift stayed green.

Usage:
    python3 tools/check_links.py [root ...]   # default root: repo root
Exit code 0 = every internal relative link (and anchor) resolves; 1 otherwise.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))

# Markdown inline link target: the (...) part of [text](target).
LINK_RE = re.compile(r"\]\(([^)]+)\)")
ATX_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE_RE = re.compile(r"^\s*(```+|~~~+)")
HTML_TAG_RE = re.compile(r"<[^>]+>")
# Punctuation github-slugger strips outright: the two Unicode general/supplemental
# punctuation blocks plus an explicit ASCII set. Space, hyphen, underscore and
# alphanumerics are preserved; whitespace is converted to hyphens separately.
SLUG_STRIP_RE = re.compile(
    "[ -⁯⸀-⹿\\\\'!\"#$%&()*+,./:;<=>?@\\[\\]^`{|}~]")

SKIP_PREFIXES = ("http://", "https://", "mailto:", "honua://", "tel:", "data:")


def slugify(text):
    """Replicate GitHub's heading-anchor slug algorithm."""
    text = HTML_TAG_RE.sub("", text)
    text = text.strip().lower()
    text = SLUG_STRIP_RE.sub("", text)
    text = re.sub(r"\s", "-", text)
    return text


def heading_anchors(path):
    """Return the set of anchor slugs for all ATX headings in a Markdown file."""
    anchors = set()
    seen = {}
    in_fence = False
    fence_marker = None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return anchors
    for line in lines:
        fence = FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)[0]
            if not in_fence:
                in_fence, fence_marker = True, marker
            elif marker == fence_marker:
                in_fence, fence_marker = False, None
            continue
        if in_fence:
            continue
        m = ATX_HEADING_RE.match(line)
        if not m:
            continue
        base = slugify(m.group(2))
        if base == "":
            continue
        n = seen.get(base, 0)
        anchors.add(base if n == 0 else f"{base}-{n}")
        seen[base] = n + 1
    return anchors


def iter_md_files(roots):
    for root in roots:
        if os.path.isfile(root):
            yield root
            continue
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d != ".git"]
            for name in sorted(files):
                if name.endswith(".md"):
                    yield os.path.join(dirpath, name)


def main(argv):
    roots = [os.path.abspath(p) for p in argv] or [REPO]
    anchor_cache = {}
    broken = []
    checked = 0

    for md in iter_md_files(roots):
        base_dir = os.path.dirname(md)
        with open(md, "r", encoding="utf-8") as fh:
            text = fh.read()
        for raw in LINK_RE.findall(text):
            target = raw.strip()
            # Drop an optional link title:  [t](path "title")
            if not target.startswith("#") and " " in target:
                target = target.split(" ", 1)[0]
            if not target or target.startswith(SKIP_PREFIXES):
                continue

            path_part, _, fragment = target.partition("#")
            path_part = path_part.split("?", 1)[0]

            if path_part == "":
                resolved = md  # same-file anchor
            else:
                resolved = os.path.normpath(os.path.join(base_dir, path_part))
                if not os.path.exists(resolved):
                    broken.append(
                        f"{os.path.relpath(md, REPO)} -> {target} (file not found)")
                    continue

            checked += 1
            if fragment and resolved.endswith(".md"):
                if resolved not in anchor_cache:
                    anchor_cache[resolved] = heading_anchors(resolved)
                if fragment.lower() not in anchor_cache[resolved]:
                    broken.append(
                        f"{os.path.relpath(md, REPO)} -> {target} "
                        f"(anchor '#{fragment}' not a heading in "
                        f"{os.path.relpath(resolved, REPO)})")

    if broken:
        for b in sorted(set(broken)):
            print("BROKEN LINK:", b, file=sys.stderr)
        print(f"Internal relative link check failed ({len(set(broken))} broken).",
              file=sys.stderr)
        return 1
    print(f"All internal relative links resolve ({checked} checked, "
          f"including #anchor fragments).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
