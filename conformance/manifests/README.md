# Reference manifest

`honua.manifest.json` is generated from the Honua server capability registry.
The current producer was verified at server commit
`23a0a9c243bdcdc261ee0e8db7cf9c10a7f3f130`.

Run the producer from the server checkout on the build host:

```bash
dotnet run --project scripts/conformance/mcp/manifest-gen -- artifacts/honua.manifest.json
```

Copy that output to this checkout, then project it onto the standard vocabulary
and validate the result:

```bash
python3 tools/project_reference_manifest.py /path/to/honua.manifest.json conformance/manifests/honua.manifest.json
python3 conformance/check_manifest.py --strict conformance/manifests/honua.manifest.json
```

The producer includes Honua extension tools. The projection preserves standard
tool mappings and resource families, and reports every excluded extension by
its advertised name. This refresh retained 35 tool mappings (34 distinct standard
names) and seven resource families, and excluded 31 extension tools. Strict
validation checks that the projection still covers every implemented standard
tool and resource family; filtering an obsolete tool name cannot hide missing
standard coverage.
