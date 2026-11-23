#!/usr/bin/env python3
"""Serve the tiny-ava static browser demo locally at http://127.0.0.1:8788."""

import http.server
import os
import socketserver
from pathlib import Path

PORT = 8788
DEMO_DIR = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".onnx": "application/octet-stream",
        ".js": "application/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(DEMO_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"tiny-ava browser demo running at: http://127.0.0.1:{PORT}", flush=True)
        print("Press Ctrl+C to stop.", flush=True)
        httpd.serve_forever()
