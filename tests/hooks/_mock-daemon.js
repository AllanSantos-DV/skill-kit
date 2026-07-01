'use strict';
// Shared test helper: an in-process HTTP server that mimics the mcp-memory
// daemon's MCP Streamable HTTP transport, plus a tmp run-dir with daemon.json.
// Filename starts with "_" so `node --test` does not pick it up as a suite.

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tmpRunDir(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-run-'));
  fs.writeFileSync(path.join(dir, 'daemon.json'), JSON.stringify({ url, port: Number(new URL(url).port), pid: 1, version: 'test' }));
  return dir;
}

/**
 * Start a mock MCP daemon. `opts`:
 *   healthStatus, initStatus, sseMode, results, captured,
 *   hangOnCall, resetOnCall, toolError.
 */
function startMock(opts = {}) {
  const captured = opts.captured || [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(opts.healthStatus || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
        return;
      }
      if (req.method === 'DELETE') { res.writeHead(200); res.end(); return; }
      let msg = {};
      try { msg = JSON.parse(body); } catch (_) { /* noop */ }
      if (msg.method === 'initialize') {
        if (opts.initStatus && opts.initStatus !== 200) { res.writeHead(opts.initStatus); res.end('err'); return; }
        captured.push({ initParams: msg.params });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'sess-abc-123' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'mock', version: '0' }, capabilities: {} } }));
        return;
      }
      if (msg.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
      if (msg.method === 'tools/call') {
        captured.push({ headers: req.headers, params: msg.params });
        const name = msg.params && msg.params.name;
        if (opts.hangOnCall) { return; }
        if (opts.resetOnCall) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.write('{"jsonrpc":"2.0","id":');
          req.socket.destroy();
          return;
        }
        if (opts.toolError) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'boom' } }));
          return;
        }
        let payloadText;
        if (name === 'search_memory') {
          payloadText = JSON.stringify({ results: opts.results || [] });
        } else if (name === 'add_document') {
          payloadText = 'Document added with ID: ' + msg.params.arguments.documentId;
        } else if (name === 'delete_document') {
          payloadText = 'Document removed successfully: ' + msg.params.arguments.documentId;
        } else {
          payloadText = '{}';
        }
        const rpc = { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: payloadText }] } };
        const send = () => {
          if (opts.sseMode) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end('event: message\ndata: ' + JSON.stringify(rpc) + '\n\n');
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(rpc));
          }
        };
        if (opts.delayMs) { setTimeout(send, opts.delayMs); } else { send(); }
        return;
      }
      res.writeHead(400); res.end('bad');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port;
      resolve({ url, close: () => server.close(), captured });
    });
  });
}

module.exports = { startMock, tmpRunDir };
