import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assetPath, demoPath, getProject, outputPath } from './projects.mjs';
import { readFsData } from './fsdata.mjs';
import { createMock } from './mocks.mjs';

const types = { '.html': 'text/html', '.htm': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject' };

export async function createDemoServer(project, { compression = 'gzip', cert, key, mock = true } = {}) {
    const manifest = JSON.parse(fs.readFileSync(demoPath('.cache', 'manifests', `${project.name}.json`), 'utf8'));
    const upstream = compression === 'upstream';
    const responses = upstream ? undefined : readFsData(outputPath(project, compression));
    const backend = mock ? await createMock(project) : undefined;
    const handler = async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-CC4ES-Demo', `${project.name}; ${compression}; simulated-device`);
            if (await backend?.handle(req, res, url)) return;
            let pathname = url.pathname === '/' ? manifest.entry : manifest.aliases[url.pathname] ?? url.pathname;
            // DWC uses client-side navigation. Only HTML navigation receives the SPA fallback.
            if (project.name === 'DuetWebControl' && !path.extname(pathname) && req.headers.accept?.includes('text/html')) pathname = manifest.entry;
            if (upstream) {
                const file = manifest.files.find(file => file.url === pathname);
                if (file) {
                    const bytes = fs.readFileSync(path.join(assetPath(project), file.url));
                    res.setHeader('Content-Type', types[path.extname(file.url)] ?? 'application/octet-stream');
                    res.setHeader('Content-Length', bytes.length); res.end(req.method === 'HEAD' ? undefined : bytes); return;
                }
            } else {
                const response = responses.get(pathname);
                if (response) {
                    const encoding = response.headers['content-encoding'];
                    if (encoding && !(req.headers['accept-encoding'] ?? '').split(',').some(item => item.trim().split(';')[0] === encoding)) {
                        res.statusCode = 406; res.end(`Client must accept ${encoding}.`); return;
                    }
                    res.statusCode = response.status;
                    // Send the generated headers and body as stored in C. No recompression.
                    for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
                    res.end(req.method === 'HEAD' ? undefined : response.body); return;
                }
            }
            res.statusCode = 404; res.end('Not included in this demo.');
        } catch (error) { console.error(error); if (!res.headersSent) res.statusCode = 500; res.end('Demo request failed.'); }
    };
    if (!!cert !== !!key) throw new Error('Provide both --cert and --key.');
    const tls = cert ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : undefined;
    const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
    let websocketServer;
    return {
        server,
        async listen(port) {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
            if (project.name === 'ESP3D-WEBUI' && backend) {
                websocketServer = tls ? https.createServer(tls) : http.createServer();
                backend.attach(websocketServer);
                await new Promise((resolve, reject) => { websocketServer.once('error', reject); websocketServer.listen(server.address().port + 1, '127.0.0.1', resolve); });
            }
            return `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}/`;
        },
        async close() {
            backend?.close?.();
            await Promise.all([server, websocketServer].filter(Boolean).map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })));
        }
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: {
        project: { type: 'string' }, compression: { type: 'string' }, port: { type: 'string', default: '8080' },
        cert: { type: 'string' }, key: { type: 'string' }
    } });
    try {
        const project = getProject(values.project);
        const demo = await createDemoServer(project, values);
        const url = await demo.listen(Number(values.port));
        console.log(`${project.name}: ${url} (${values.compression ?? 'gzip'}, simulated device APIs).`);
        if (values.compression === 'brotli' && !values.cert) console.log('Brotli browser support must be checked on loopback HTTP; use --cert/--key for HTTPS elsewhere.');
        const stop = async () => { await demo.close(); process.exit(); };
        process.on('SIGINT', stop); process.on('SIGTERM', stop);
    } catch (error) { console.error(error); process.exitCode = 1; }
}
