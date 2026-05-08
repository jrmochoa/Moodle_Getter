"""
Local CORS proxy for Moodle Activity Report
Serves index.html and proxies all requests to Moodle (including session cookies).

Run:       python server.py   (or python3 server.py)
Then open: http://localhost:8080

No pip packages needed — Python standard library only.
"""
import os, json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from urllib.request import urlopen, Request
from urllib.error import URLError

PORT      = 8080
HTML_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')

CORS = [
    ('Access-Control-Allow-Origin',  '*'),
    ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
    ('Access-Control-Allow-Headers', 'Accept, Content-Type, Cookie'),
]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        path = self.path.split('?')[0]
        print(f'  {self.command:7} {path}')

    def send_cors(self):
        for k, v in CORS:
            self.send_header(k, v)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)

        if parsed.path == '/proxy':
            target = qs.get('url', [''])[0]
            if not target:
                self.send_response(400)
                self.send_cors()
                self.end_headers()
                self.wfile.write(b'{"error":"Missing url parameter"}')
                return

            cookie = qs.get('cookie', [''])[0]
            accept = qs.get('accept',  ['application/json'])[0]

            headers = {
                'Accept':     accept,
                'User-Agent': 'Mozilla/5.0 MoodleReportProxy/1.0',
            }
            if cookie:
                headers['Cookie'] = cookie if cookie.startswith('MoodleSession=') \
                                    else f'MoodleSession={cookie}'
            try:
                req = Request(target, headers=headers)
                with urlopen(req, timeout=30) as resp:
                    body    = resp.read()
                    ct      = resp.headers.get('Content-Type', 'application/octet-stream')
                    status  = resp.status
                self.send_response(status)
                self.send_header('Content-Type', ct)
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            except URLError as e:
                self.send_response(502)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return

        # Serve index.html for all other paths
        try:
            with open(HTML_FILE, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_cors()
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'index.html not found')

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print()
    print('  Moodle Activity Report — Local Server')
    print('  ======================================')
    print(f'  Open:  http://localhost:{PORT}')
    print('  Stop:  Ctrl+C')
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
