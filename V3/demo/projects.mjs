import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

export const demoRoot = path.dirname(fileURLToPath(import.meta.url));
export const projects = [
    { name: 'DuetWebControl', url: 'https://github.com/Duet3D/DuetWebControl.git', tag: 'v3.7.0', sha: '92bb294cf4cab136aac4196a952e5f3ba359ad74', build: 'build', entry: '/index.html' },
    { name: 'ESP3D-WEBUI', url: 'https://github.com/luc-github/ESP3D-WEBUI.git', tag: 'v3.1.0', sha: 'b6f501c3f91399440ead562d3ce9ce10f9ae5559', build: 'cnc-grbl', entry: '/index.html' },
    { name: 'WLED', url: 'https://github.com/wled/WLED.git', tag: 'v16.0.1', sha: '29b389df1c1aaec6ff53aea742d17063b985906c', build: 'build', entry: '/index.htm' }
];

export const demoPath = (...parts) => {
    const result = path.resolve(demoRoot, ...parts);
    const relative = path.relative(demoRoot, result);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path must stay inside V3/demo.');
    return result;
};

export const selectProjects = (name = 'all') => name === 'all' ? projects : [getProject(name)];
export function getProject(name) {
    const project = projects.find(project => project.name.toLowerCase() === name?.toLowerCase());
    if (!project) throw new Error(`Unknown project. Choose ${projects.map(p => p.name).join(', ')} or all.`);
    return project;
}

export const sourcePath = project => demoPath('src', project.name);
export const buildPath = project => demoPath('.cache', 'build', project.name);
export const assetPath = project => demoPath('.cache', 'assets', project.name);
export const compressions = {
    none: { fileName: 'fsdata_raw.c', options: { compression: 'none' } },
    gzip: { fileName: 'fsdata_gzip_level9.c', options: { compression: 'gzip', gzipLevel: 9 } },
    brotli: { fileName: 'fsdata_brotli_quality11.c', options: { compression: 'brotli', brotliQuality: 11 } },
    zopfli: { fileName: 'fsdata_zopfli_iterations100.c', options: { compression: 'zopfli', zopfliIterations: 100, gzipLevel: 9 } }
};
export function outputPath(project, compression = 'gzip') {
    if (!Object.hasOwn(compressions, compression)) throw new Error(`Unknown compression: ${compression}`);
    return demoPath('dst', project.name, compressions[compression].fileName);
}

// All dependency downloads, native-build caches and temporary files stay in demo.
export function buildEnvironment(extra = {}) {
    const temporary = demoPath('.cache', 'tmp');
    fs.mkdirSync(temporary, { recursive: true });
    return {
        ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary,
        npm_config_cache: demoPath('.cache', 'npm'), npm_config_devdir: demoPath('.cache', 'node-gyp'),
        npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false',
        XDG_CACHE_HOME: demoPath('.cache'), ...extra
    };
}

export function upstreamRevision(project) {
    return execFileSync('git', ['-C', sourcePath(project), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

export async function runNpm(args, cwd, extraEnvironment = {}) {
    const candidates = [
        process.env.npm_execpath, process.env.CC4ES_NPM_CLI,
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ];
    const cli = candidates.find(candidate => candidate && fs.existsSync(candidate));
    if (!cli) throw new Error('Run this command through npm run, or set CC4ES_NPM_CLI to the installed npm-cli.js.');
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, ...args], {
            cwd, env: buildEnvironment(extraEnvironment), stdio: 'inherit', windowsHide: true
        });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} failed (${code}).`)));
    });
}

export function walkFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not accepted in prepared assets: ${fullPath}`);
        return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
    });
}
