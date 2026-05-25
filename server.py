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
                    resp_data = resp.read()
                    # 解析 JSON 以提取 reasoning_content 内容（DeepSeek 的思考过程）
                    try:
                        data = json.loads(resp_data.decode('utf-8'))
                        if 'choices' in data and len(data['choices']) > 0:
                            choice = data['choices'][0]
                            if 'message' in choice and 'reasoning_content' in choice['message']:
                                # 将 reasoning 内容附加到 response 中
                                reasoning = choice['message']['reasoning_content']
                                if reasoning:
                                    # 在 response 末尾添加思考过程（用特殊标记分隔）
                                    if 'content' not in choice['message']:
                                        choice['message']['content'] = ''
                                    choice['message']['content'] += '\n\n---\n**思考过程**\n' + reasoning
                                    resp_data = json.dumps(data).encode('utf-8')
                    except:
                        pass  # JSON 解析失败时保持原样
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(resp_data)
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