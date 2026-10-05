"""Local-only HTTP tunnel into the internal Docker network via docker exec.

Colima cannot publish a port from an internal network. Keep the backend offline
and forward only /api/ requests, with no logs or credentials in process arguments.
This disposable proof helper is never part of a production deployment.
"""
import base64
import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

INNER = """
import base64,http.client,json,sys
req=json.load(sys.stdin)
conn=http.client.HTTPConnection('127.0.0.1',8000,timeout=35)
conn.request(req['method'],req['path'],body=base64.b64decode(req['body']),headers=req['headers'])
res=conn.getresponse()
body=res.read(4194305)
if len(body)>4194304: raise RuntimeError('Response exceeds proof bound')
print(json.dumps({'status':res.status,'type':res.getheader('Content-Type','application/json'),'body':base64.b64encode(body).decode()}))
"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def forward(self):
        if not self.path.startswith('/api/') or '\n' in self.path or '\r' in self.path:
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 <= size <= 4194304:
                self.send_error(413)
                return
            request = {'method':self.command,'path':self.path,'body':base64.b64encode(self.rfile.read(size)).decode(), 'headers':{name:self.headers[name] for name in ('Authorization','Content-Type','Content-Disposition','Accept') if name in self.headers}}
            run = subprocess.run(['docker','exec','--interactive','legal-os-ciso-cpl02-backend','python','-c',INNER],input=json.dumps(request).encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=40,check=True)
            response = json.loads(run.stdout)
            body = base64.b64decode(response['body'])
            self.send_response(response['status'])
            self.send_header('Content-Type',response['type'])
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            try:
                self.send_error(502, 'Local synthetic backend unavailable')
            except (BrokenPipeError, ConnectionResetError):
                pass

    do_GET = do_POST = do_PATCH = do_DELETE = do_OPTIONS = forward

ThreadingHTTPServer(('127.0.0.1',18784),Handler).serve_forever()
