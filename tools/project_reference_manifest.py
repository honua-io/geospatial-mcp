#!/usr/bin/env python3
"""Project a server-emitted manifest onto the standard tool vocabulary."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Unmodified server-emitted manifest")
    parser.add_argument("output", type=Path, help="Standard conformance manifest")
    args = parser.parse_args()
    manifest = json.loads(args.source.read_text())
    index = json.loads((ROOT / "spec/schemas/index.json").read_text())
    standard_names = {tool["standardName"] for tool in index["tools"]}
    extensions = [tool["advertisedName"] for tool in manifest["tools"]
                  if tool["standardName"] not in standard_names]
    manifest["tools"] = [tool for tool in manifest["tools"]
                         if tool["standardName"] in standard_names]
    args.output.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Projected {len(manifest['tools'])} standard tools; "
          f"excluded {len(extensions)} implementation extensions:")
    for name in extensions:
        print(f"  {name}")


if __name__ == "__main__":
    main()
