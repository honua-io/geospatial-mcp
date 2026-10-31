"""Exercise the real gh HTTP cache without GitHub access or credentials."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("source_api", Path(__file__).resolve().parents[1] / "fetch-certification-requirements.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourceApiCacheTests(unittest.TestCase):
    def test_immutable_reads_survive_repeat_rate_refusal_but_branch_checks_stay_fresh(self):
        actual_gh = shutil.which("gh")
        self.assertIsNotNone(actual_gh, "certification requires the GitHub CLI")
        counts = {}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                counts[self.path] = counts.get(self.path, 0) + 1
                immutable = "/git/" in self.path
                status = 403 if immutable and counts[self.path] > 1 else 200
                body = json.dumps({"request": counts[self.path]} if status == 200 else
                                  {"message": "API rate limit exceeded for installation"}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as work:
                directory = Path(work)
                # Only redirect gh's API URL to this loopback fixture. The real
                # CLI implements caching, including sharing it across processes.
                shim = directory / "gh"
                shim.write_text("#!/usr/bin/env python3\nimport os,sys\n"
                                f"args=sys.argv[1:]; args[1]='http://127.0.0.1:{server.server_port}/'+args[1]\n"
                                f"os.execv({actual_gh!r}, [{actual_gh!r}, *args])\n")
                shim.chmod(0o700)
                environment = {"PATH": str(directory) + os.pathsep + os.environ["PATH"],
                               "XDG_CACHE_HOME": str(directory / "cache"),
                               "GH_CONFIG_DIR": str(directory / "config"),
                               "GH_TOKEN": "offline-test-only", "GITHUB_TOKEN": "offline-test-only"}
                with patch.dict(os.environ, environment):
                    for endpoint in ("git/blobs/" + "a" * 40,
                                     "git/trees/" + "b" * 40 + "?recursive=1"):
                        path = "repos/honua-io/honua-release/" + endpoint
                        self.assertEqual(MODULE.api(path), {"request": 1})
                        self.assertEqual(MODULE.api(path), {"request": 1})
                        self.assertEqual(counts["/" + path], 1)
                    for endpoint in ("branches/trunk", "compare/" + "a" * 40 + "..." + "b" * 40):
                        path = "repos/honua-io/honua-release/" + endpoint
                        self.assertEqual(MODULE.api(path), {"request": 1})
                        self.assertEqual(MODULE.api(path), {"request": 2})
                    # A mutable tree ref is not a content-addressed object. Its
                    # second request must reach the fixture and still refuse.
                    path = "repos/honua-io/honua-release/git/trees/trunk?recursive=1"
                    self.assertEqual(MODULE.api(path), {"request": 1})
                    with self.assertRaises(MODULE.subprocess.CalledProcessError):
                        MODULE.api(path)
                    self.assertEqual(counts["/" + path], 2)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
