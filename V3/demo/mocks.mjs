import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { buildPath } from './projects.mjs';

// Device APIs are local simulations. Static frontend bytes are never patched.
export async function createMock(project) {
    if (project.name === 'ESP3D-WEBUI') {
        const require = createRequire(path.join(buildPath(project), 'package.json'));
        const target = require('./config/targets/CNC/GRBL/index.js');
        const WebSocketServer = require('ws').Server;
        let websocket;
        const send = (text, binary = true, notification = true) => {
            for (const client of websocket?.clients ?? []) if (client.readyState === 1) {
                client.send(binary ? Buffer.from(text, 'latin1') : (notification ? 'NOTIFICATION:' : '') + text);
            }
        };
        return {
            handle(req, res, url) {
                const facade = {
                    status(code) { res.statusCode = code; return this; },
                    send(body) { if (!res.writableEnded) res.end(body); return this; },
                    json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return this; }
                };
                req.query = Object.fromEntries(url.searchParams);
                req.originalUrl = req.url;
                if (url.pathname === '/command') target.commandsQuery(req, facade, send);
                else if (url.pathname === '/config') target.configURI(req, facade);
                else if (url.pathname === '/login') target.loginURI(req, facade);
                else if (['/files', '/sdfiles'].includes(url.pathname)) facade.json({ files: [], path: '/', status: 'ok', occupation: 0, total: '1 MB', used: '0 B' });
                else return false;
                if (!res.writableEnded) facade.send('error:unknown command\n');
                return true;
            },
            attach(server) {
                websocket = new WebSocketServer({ server });
                websocket.on('connection', socket => { socket.send('currentID:0'); socket.send('activeID:0'); });
            },
            close() { for (const client of websocket?.clients ?? []) client.terminate(); websocket?.close(); }
        };
    }
    if (project.name === 'WLED') {
        const state = {
            on: true, bri: 128, transition: 7, bs: 0, ps: -1, pl: -1, mainseg: 0,
            nl: { on: false, dur: 60, tbri: 0, fade: true }, udpn: { send: false, recv: false },
            seg: [{ id: 0, start: 0, stop: 60, len: 60, grp: 1, spc: 0, of: 0, on: true, bri: 255,
                col: [[255, 160, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], fx: 0, sx: 128, ix: 128,
                pal: 0, sel: true, rev: false, mi: false, cln: -1, lc: 1, cct: 127, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false }]
        };
        const info = {
            ver: '16.0.1', vid: 2605090, name: 'WLED demo', udpport: 21324,
            leds: { count: 60, pwr: 500, fps: 42, maxpwr: 850, maxseg: 16, seglc: [1], bootps: 0 },
            live: false, liveseg: -1, lm: '', lip: '', ws: -1, ndc: 0,
            fxcount: 3, palcount: 3, cpalcount: 0, maps: [], opt: 0, simplifiedui: false,
            wifi: { bssid: '00:00:00:00:00:00', rssi: -42, signal: 90, channel: 6, ap: false },
            fs: { u: 32, t: 1024, pmt: 1 }, arch: 'esp32', core: 'demo', brand: 'WLED',
            product: 'Offline simulation', mac: '000000000000', ip: '127.0.0.1', freeheap: 100000, uptime: 100
        };
        return { async handle(req, res, url) {
            if (url.pathname === '/settings/s.js' && url.searchParams.get('p') === '0') {
                // The settings menu requests a firmware-generated script even though
                // it has no configuration fields. Device settings are not simulated.
                res.setHeader('Content-Type', 'application/javascript'); res.end('function GetV() {}'); return true;
            }
            if (req.method === 'POST' && ['/json', '/json/state', '/json/si'].includes(url.pathname)) {
                const chunks = []; for await (const chunk of req) chunks.push(chunk);
                const command = JSON.parse(Buffer.concat(chunks).toString() || '{}');
                for (const key of ['bri', 'transition', 'ps']) if (typeof command[key] === 'number') state[key] = command[key];
                if (command.on !== undefined) state.on = command.on === 't' ? !state.on : !!command.on;
                for (const segment of Array.isArray(command.seg) ? command.seg : command.seg ? [command.seg] : []) Object.assign(state.seg[segment.id ?? 0], segment);
            }
            const endpoints = {
                '/json': { state, info }, '/json/si': { state, info }, '/json/state': state, '/json/info': info,
                '/json/effects': ['Solid', 'Blink', 'Breathe'], '/json/fxdata': ['', 'Speed,Intensity;!;!', 'Speed,Intensity;!;!'],
                '/json/palettes': ['Default', '* Random Cycle', '* Color 1'],
                '/json/palx': { m: 0, p: { 0: [[0, 255, 160, 0], [255, 255, 160, 0]] } },
                '/json/nodes': { nodes: [] }, '/presets.json': { 0: {}, 1: { n: 'Warm demo', on: true, bri: 128 } },
                '/cfg.json': {}, '/holidays.json': []
            };
            if (url.pathname === '/skin.css') { res.setHeader('Content-Type', 'text/css'); res.end(''); return true; }
            if (!(url.pathname in endpoints)) return false;
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(endpoints[url.pathname])); return true;
        } };
    }
    // Reuse the locked upstream object-model implementation for correct default shapes.
    const bundled = await build({
        entryPoints: [path.join(buildPath(project), 'node_modules', '@duet3d', 'objectmodel', 'dist', 'index.js')],
        bundle: true, platform: 'node', format: 'esm', write: false
    });
    const { default: ObjectModel } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
    const model = new ObjectModel();
    model.update({
        state: { status: 'idle', machineMode: 'FFF', currentTool: 0, upTime: 100, time: new Date().toISOString() },
        network: { name: 'Duet demo' },
        boards: [{ firmwareName: 'RepRapFirmware', firmwareVersion: '3.7.0', name: 'Duet 3 demo', shortName: '6HC', vIn: { current: 24 } }],
        move: { axes: ['X', 'Y', 'Z'].map(letter => ({ letter, homed: true, visible: true, userPosition: 0, machinePosition: 0, max: 200 })), extruders: [{ position: 0, factor: 1 }], motionSystems: [{}] },
        sensors: { analog: [{ name: 'Nozzle', lastReading: 24, type: 'thermistor' }, { name: 'Bed', lastReading: 23, type: 'thermistor' }] },
        heat: { heaters: [{ active: 200, standby: 0, current: 24, sensor: 0, state: 'off', max: 300 }, { active: 60, standby: 0, current: 23, sensor: 1, state: 'off', max: 120 }], bedHeaters: [1] },
        tools: [{ number: 0, name: 'Nozzle', heaters: [0], extruders: [0], active: [200], standby: [0], state: 'active' }],
        fans: [{ name: 'Print fan', actualValue: 0, requestedValue: 0 }], volumes: [{ mounted: true, capacity: 1073741824, freeSpace: 900000000 }]
    });
    let reply = 'ok\n';
    const seqs = { reply: 0, volChanges: [0], ...Object.fromEntries(Object.keys(model).map(key => [key, 0])) };
    return { handle(req, res, url) {
        const endpoint = url.pathname.slice(1);
        const send = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return true; };
        if (endpoint === 'rr_connect') return send({ err: 0, sessionTimeout: 8000, apiLevel: 1 });
        if (endpoint === 'rr_model') {
            const key = url.searchParams.get('key');
            const snapshot = { ...JSON.parse(JSON.stringify(model)), seqs };
            return send({ key: key ?? '', flags: url.searchParams.get('flags'), result: key ? key.split('.').reduce((v, k) => v?.[k], snapshot) ?? null : snapshot });
        }
        if (endpoint === 'rr_gcode') {
            const code = url.searchParams.get('gcode') ?? '';
            reply = code.startsWith('M115') ? 'FIRMWARE_NAME:RepRapFirmware demo\n' : 'ok\n';
            seqs.reply++;
            return send({ buff: 4096 });
        }
        if (endpoint === 'rr_reply') { res.end(reply); return true; }
        if (endpoint === 'rr_filelist') return send({ dir: url.searchParams.get('dir'), files: [], err: 0 });
        if (endpoint === 'rr_download' && /\/dwc-(settings|defaults)\.json$/.test(url.searchParams.get('name') ?? '')) return send({});
        if (endpoint === 'rr_download' || endpoint === 'rr_fileinfo') { res.statusCode = 404; res.end('Demo file not found'); return true; }
        if (endpoint === 'rr_disconnect') return send({ err: 0 });
        return false;
    } };
}
