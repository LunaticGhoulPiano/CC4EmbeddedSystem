import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { demoPath, selectProjects, sourcePath, buildPath, assetPath, upstreamRevision, runNpm, walkFiles } from './projects.mjs';

const wledRoutes = {
    PAGE_index: '/index.htm', PAGE_pixart: '/pixart.htm', PAGE_pxmagic: '/pxmagic.htm', PAGE_pixelforge: '/pixelforge.htm',
    PAGE_cpal: '/cpal.htm', PAGE_edit: '/edit', PAGE_settingsCss: '/style.css', JS_common: '/common.js', JS_iro: '/iro.js',
    JS_omggif: '/omggif.js', PAGE_settings: '/settings', PAGE_settings_wifi: '/settings/wifi',
    PAGE_settings_leds: '/settings/leds', PAGE_settings_dmx: '/settings/dmx', PAGE_settings_ui: '/settings/ui',
    PAGE_settings_sync: '/settings/sync', PAGE_settings_time: '/settings/time', PAGE_settings_sec: '/settings/sec',
    PAGE_settings_um: '/settings/um', PAGE_settings_2D: '/settings/2D', PAGE_settings_pin: '/settings/lock',
    PAGE_settings_pininfo: '/settings/pins', PAGE_usermod: '/usermod', PAGE_update: '/update', PAGE_welcome: '/welcome',
    PAGE_liveview: '/liveview', PAGE_liveviewws2D: '/liveview2D', PAGE_404: '/404.htm', favicon: '/favicon.ico'
};

function writeAsset(root, url, content) {
    const destination = path.resolve(root, `.${url}`);
    if (!destination.startsWith(root + path.sep)) throw new Error(`Invalid asset URL: ${url}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
}

function copyRuntimeAssets(source, target) {
    for (const file of walkFiles(source)) {
        if (/\.(gz|br|zip|map)$/i.test(file)) continue;
        const relative = path.relative(source, file);
        writeAsset(target, '/' + relative.split(path.sep).join('/'), fs.readFileSync(file));
    }
}

export async function prepareProject(project, { install = false } = {}) {
    const source = sourcePath(project);
    if (!fs.existsSync(path.join(source, '.git'))) throw new Error(`Submodule is missing: ${source}. No automatic clone or fetch is performed.`);
    const revision = upstreamRevision(project);
    if (revision !== project.sha) throw new Error(`${project.name}: expected ${project.sha}, found ${revision}.`);
    const work = buildPath(project);
    const marker = path.join(work, '.cc4es-source');
    if (!fs.existsSync(work)) {
        fs.cpSync(source, work, {
            recursive: true,
            filter: file => !['.git', 'node_modules'].includes(path.basename(file))
        });
        fs.writeFileSync(marker, revision);
    } else if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== revision) {
        throw new Error(`Build directory does not match ${project.name}'s pinned revision: ${work}`);
    }
    if (install) {
        // Package lifecycle scripts are deliberately disabled: they may download into global caches.
        await runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], work);
    }
    if (!fs.existsSync(path.join(work, 'node_modules'))) throw new Error(`${project.name}: dependencies missing. Use --install only after authorizing downloads.`);
    console.log(`Building ${project.name} ${project.tag}...`);
    await runNpm(['run', project.build], work, project.name === 'DuetWebControl' ? { NOZIP: '1', DWC_SOURCEMAP: '0' } : {});
    const target = assetPath(project);
    if (fs.existsSync(target)) {
        // Only remove this project's generated asset directory, after checking its absolute location.
        if (path.dirname(target) !== demoPath('.cache', 'assets')) throw new Error('Unexpected asset directory.');
        fs.rmSync(target, { recursive: true, force: true });
    }
    fs.mkdirSync(target, { recursive: true });
    const aliases = {};
    if (project.name === 'DuetWebControl') copyRuntimeAssets(path.join(work, 'dist'), target);
    else if (project.name === 'ESP3D-WEBUI') {
        const index = path.join(work, 'build', 'index.html');
        if (!fs.existsSync(index)) throw new Error('ESP3D did not emit build/index.html.');
        writeAsset(target, '/index.html', fs.readFileSync(index));
        const flash = path.join(work, 'server', 'CNC', 'GRBL', 'Flash');
        for (const file of walkFiles(flash)) {
            if (/\.(gz|br|map)$/i.test(file) || path.basename(file) === 'index.html') continue;
            writeAsset(target, '/' + path.relative(flash, file).split(path.sep).join('/'), fs.readFileSync(file));
        }
    } else {
        const { parseByteArrays } = await import('./fsdata.mjs');
        for (const file of fs.readdirSync(path.join(work, 'wled00')).filter(name => /^(html|js)_.*\.h$/.test(name)).sort()) {
            for (const [symbol, bytes] of parseByteArrays(fs.readFileSync(path.join(work, 'wled00', file), 'utf8'))) {
                const route = wledRoutes[symbol];
                if (!route) throw new Error(`WLED static asset has no URL mapping: ${symbol}`);
                // WLED's firmware routes extensionless requests to the stored HTML pages.
                const url = path.extname(route) ? route : '/' + (symbol.startsWith('PAGE_') ? symbol.slice(5) : symbol) + '.htm';
                if (url !== route) aliases[route] = url;
                const content = bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes;
                writeAsset(target, url, content);
            }
        }
        // The runtime serves this image separately from the generated header arrays.
        for (const name of ['favicon.ico', 'favicon.png']) {
            const file = path.join(work, 'wled00', 'data', name);
            if (fs.existsSync(file)) writeAsset(target, '/' + name, fs.readFileSync(file));
        }
    }
    const files = walkFiles(target).map(file => {
        const bytes = fs.readFileSync(file);
        return { url: '/' + path.relative(target, file).split(path.sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    if (!files.some(file => file.url === project.entry)) throw new Error(`Entry page is missing: ${project.entry}`);
    const manifest = { project: project.name, tag: project.tag, revision, node: process.version, target: project.name === 'ESP3D-WEBUI' ? 'CNC/GRBL' : 'default', entry: project.entry, aliases, files };
    fs.mkdirSync(demoPath('.cache', 'manifests'), { recursive: true });
    fs.writeFileSync(demoPath('.cache', 'manifests', `${project.name}.json`), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Prepared ${project.name}: ${files.length} assets, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes.`);
    return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: { project: { type: 'string', default: 'all' }, install: { type: 'boolean', default: false } } });
    try { for (const project of selectProjects(values.project)) await prepareProject(project, values); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
