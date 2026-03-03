#!/usr/bin/env node
// MCP server: web search via GitHub Actions
// Drop-in replacement for mcp-searxng
// Tool name: searxng_web_search (same as before — no prompt changes needed)

const { execFileSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const SCRIPT = path.join(__dirname, 'gh_search.sh');

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line.trim()); } catch { return; }

    if (msg.method === 'initialize') {
        send({ jsonrpc: '2.0', id: msg.id, result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'gh-search', version: '1.0.0' },
            capabilities: { tools: {} }
        }});

    } else if (msg.method === 'notifications/initialized') {
        // no response needed

    } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{
            name: 'searxng_web_search',
            description: 'Free web search via GitHub Actions (replaces SearXNG). Returns up to 10 results.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' }
                },
                required: ['query']
            }
        }]}});

    } else if (msg.method === 'tools/call' && msg.params?.name === 'searxng_web_search') {
        const query = String(msg.params?.arguments?.query || '').trim();
        if (!query) {
            send({ jsonrpc: '2.0', id: msg.id, result: {
                content: [{ type: 'text', text: '{"error": "Empty query"}' }],
                isError: true
            }});
            return;
        }
        try {
            const result = execFileSync('bash', [SCRIPT, query], {
                timeout: 150_000,
                encoding: 'utf8',
                env: { ...process.env }
            });
            send({ jsonrpc: '2.0', id: msg.id, result: {
                content: [{ type: 'text', text: result }]
            }});
        } catch (e) {
            const stderr = e.stderr || e.message || String(e);
            send({ jsonrpc: '2.0', id: msg.id, result: {
                content: [{ type: 'text', text: `Search failed: ${stderr}` }],
                isError: true
            }});
        }

    } else if (msg.id !== undefined) {
        send({ jsonrpc: '2.0', id: msg.id, result: null });
    }
});
