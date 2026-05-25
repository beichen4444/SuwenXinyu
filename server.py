"""
素问新雨 - 本地代理服务器
解决 CORS 问题，同时服务静态文件并代理 DeepSeek API 请求
启动后访问 http://localhost:8800
"""
import http.server
import json
import urllib.request
import urllib.error
import os
import ssl

PORT = 8800
DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_POST(self):
        if self.path == "/api/chat":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            api_key = self.headers.get('X-API-Key', '')

            req = urllib.request.Request(
                DEEPSEEK_API,
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + api_key
                }
            )
            ctx = ssl.create_default_context()

            try:
                with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(resp.read())
            except urllib.error.HTTPError as e:
                err_body = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(err_body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
        self.end_headers()

    def log_message(self, format, *args):
        # 精简日志
        if self.path.startswith("/api/"):
            print(f"[API] {args[0]}")
        else:
            pass  # 静默静态文件请求

if __name__ == '__main__':
    print(f"素问新雨 — 本地服务器已启动")
    print(f"访问地址: http://localhost:{PORT}")
    print(f"按 Ctrl+C 停止服务器\n")
    http.server.HTTPServer(('127.0.0.1', PORT), ProxyHandler).serve_forever()