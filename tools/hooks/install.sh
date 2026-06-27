#!/bin/sh
# Install the repo's local git hooks (the no-AI-attribution commit-msg hook).
# Run once per clone: tools/hooks/install.sh
set -e
root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks_dir"
cp "$root/tools/hooks/commit-msg" "$hooks_dir/commit-msg"
chmod +x "$hooks_dir/commit-msg"
echo "Installed commit-msg hook -> $hooks_dir/commit-msg"
