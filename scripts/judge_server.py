#!/usr/bin/env python3
"""Serve the built UI and proxy its API without exposing the adapter token."""
import argparse
import json
import mimetypes
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class JudgeHandler(BaseHTTPRequestHandler):
    server_version = "AlphaJudgeUI/1"

    def _send(self, code, body, content_type="application/json", cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self):
        path = urlsplit(self.path)
        if not path.path.startswith("/api/"):
            self._send(404, b'{"error":"Endpoint unavailable"}')
            return
        if self.command == "POST" and self.headers.get("Origin") not in self.server.origins:
            self._send(403, b'{"error":"Origin not allowed"}')
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 4096:
            self._send(413, b'{"error":"Request too large"}')
            return
        body = self.rfile.read(length) if length else None
        target = self.server.target + path.path + (("?" + path.query) if path.query else "")
        headers = {"Authorization": "Bearer " + self.server.token}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
                self._send(response.status, payload, response.headers.get_content_type())
        except urllib.error.HTTPError as error:
            self._send(error.code, error.read())
        except (urllib.error.URLError, TimeoutError):
            self._send(502, b'{"error":"Live service unavailable"}')

    def _static(self):
        relative = urlsplit(self.path).path.lstrip("/")
        candidate = (self.server.root / relative).resolve()
        root = self.server.root.resolve()
        if root not in candidate.parents and candidate != root:
            self._send(404, b"Not found", "text/plain")
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            candidate = root / "index.html"
        if not candidate.is_file():
            self._send(503, b"UI build unavailable", "text/plain")
            return
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        cache = "public, max-age=31536000, immutable" if "assets" in candidate.parts else "no-store"
        self._send(200, candidate.read_bytes(), content_type, cache)

    def do_GET(self):
        self._proxy() if urlsplit(self.path).path.startswith("/api/") else self._static()

    def do_POST(self):
        self._proxy()

    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--target", default="http://127.0.0.1:8767")
    parser.add_argument("--origin", action="append", default=[])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    token = Path(args.token_file).read_text().strip()
    if len(token) < 32:
        raise SystemExit("A strong service token is required")
    server = ThreadingHTTPServer((args.host, args.port), JudgeHandler)
    server.root = Path(args.root)
    server.target = args.target.rstrip("/")
    server.token = token
    server.origins = set(args.origin)
    server.serve_forever()


if __name__ == "__main__":
    main()
