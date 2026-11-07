import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { brotliDecompressSync, gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';
import { createCompressor, storeContent, resolveCompressionOptions } from '../dist/compression/index.js';
import { zopfliDeflate } from '../dist/compression/zopfli-deflate.js';
import { parseCliArguments, CliUsageError } from '../dist/cli.js';
import { getConfigFilePath, getLastCompressionOptions, saveLastBuildPaths } from '../dist/config.js';

const randomBytes = (length, seed = 12345) => Buffer.from(Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
}));

test('compression options keep legacy gzip settings and validate each method', () => {
    assert.equal(resolveCompressionOptions({}).compression, 'none');
    assert.equal(resolveCompressionOptions({ gzip: true }).compression, 'gzip');
    assert.equal(resolveCompressionOptions({ gzip: false }).compression, 'none');
    const saved = resolveCompressionOptions({ compression: 'brotli', brotliQuality: 0 });
    assert.deepEqual(resolveCompressionOptions({}, saved), saved);
    assert.equal(resolveCompressionOptions({ gzip: true }, saved).compression, 'gzip');
    assert.equal(resolveCompressionOptions({ compression: 'zopfli', gzip: false }).compression, 'zopfli');
    for (const invalid of [
        { compression: 'unknown' }, { gzip: 'true' }, { gzipLevel: 0 },
        { brotliQuality: -1 }, { brotliQuality: 12 }, { brotliQuality: 1.5 },
        { zopfliIterations: 0 }, { zopfliIterations: 101 }, { zopfliIterations: '15' }
    ]) assert.throws(() => resolveCompressionOptions(invalid));

    for (const method of ['none', 'gzip', 'brotli', 'zopfli']) {
        assert.equal(parseCliArguments(['--compression', method]).compression, method);
    }
    assert.equal(parseCliArguments(['--compression', 'brotli', '--gzip']).compression, 'gzip');
    assert.equal(parseCliArguments(['--gzip', '--compression', 'brotli']).compression, 'brotli');
    assert.equal(parseCliArguments(['--compression', 'zopfli', '--no-gzip']).compression, 'none');
    assert.equal(parseCliArguments(['--brotli-quality', '0']).brotliQuality, 0);
    assert.equal(parseCliArguments(['--zopfli-iterations', '100']).zopfliIterations, 100);
    for (const args of [
        ['--compression'], ['--compression', 'invalid'], ['--brotli-quality', '12'],
        ['--brotli-quality', '1.5'], ['--zopfli-iterations', '0'], ['--zopfli-iterations']
    ]) assert.throws(() => parseCliArguments(args), CliUsageError);
});

test('the storage policy delegates asynchronously and keeps raw fallbacks', async () => {
    const input = Buffer.alloc(100, 65);
    let calls = 0;
    const compressor = {
        encoding: 'gzip', description: 'test compressor',
        async compress() { calls++; await Promise.resolve(); return Buffer.alloc(20); }
    };
    assert.deepEqual(await storeContent(input, 'file.txt'), { body: input });
    assert.equal((await storeContent(input, 'image.png', compressor)).body, input);
    assert.equal(calls, 0);
    const stored = await storeContent(input, 'FILE.TXT', compressor);
    assert.equal(calls, 1);
    assert.equal(stored.encoding, 'gzip');
    assert.equal(stored.body.length, 20);
    assert.equal((await storeContent(input, 'file.txt', { ...compressor, async compress() { return input; } })).encoding, undefined);
    await assert.rejects(storeContent(input, 'file.txt', { ...compressor, async compress() { throw new Error('encoder failure'); } }), /encoder failure/);
});

test('gzip preserves the previous deterministic bytes at every supported level', async () => {
    const input = Buffer.from('A UTF-8 page: 壓縮測試 🌏\n'.repeat(200));
    for (let level = 1; level <= 9; level++) {
        const expected = gzipSync(input, { level });
        expected.fill(0, 4, 8); expected[9] = 255;
        const actual = await createCompressor({ gzip: true, gzipLevel: level }).compress(input);
        assert.deepEqual(actual, expected);
        assert.deepEqual(gunzipSync(actual), input);
    }
});

test('Brotli uses the standard br format and supports quality zero', async () => {
    for (const brotliQuality of [0, 11]) {
        const compressor = createCompressor({ compression: 'brotli', brotliQuality });
        assert.equal(compressor.encoding, 'br');
        for (const input of [Buffer.alloc(0), Buffer.from('x'), randomBytes(2048), Buffer.from('HTML CSS JavaScript '.repeat(200))]) {
            const first = await compressor.compress(input);
            assert.deepEqual(brotliDecompressSync(first), input);
            assert.deepEqual(await compressor.compress(input), first);
        }
    }
});

test('the TypeScript DEFLATE encoder round-trips literals, matches, windows and blocks', () => {
    const window = randomBytes(32768);
    const cases = [
        Buffer.alloc(0), Buffer.from([0]), Buffer.from([255, 0]),
        Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
        Buffer.alloc(259, 97), Buffer.from('abcde'.repeat(600)),
        randomBytes(5000), randomBytes(65537),
        Buffer.concat([window, window.subarray(0, 258)]),
        Buffer.from('cross the 64 KiB block boundary\n'.repeat(2200)),
        Buffer.concat([Buffer.alloc(4096, 65), randomBytes(4096), Buffer.alloc(4096, 66)])
    ];
    for (let seed = 1; seed <= 40; seed++) {
        const bytes = randomBytes(seed * 17, seed);
        cases.push(seed % 2 ? bytes : Buffer.from(bytes.map(value => value % 8)));
    }
    for (const input of cases) assert.deepEqual(inflateRawSync(zopfliDeflate(input, 2)), input, `input length ${input.length}`);
});

test('Zopfli output is deterministic gzip and never exceeds the selected zlib baseline', async () => {
    const input = fs.readFileSync(new URL('../public/index.html', import.meta.url));
    const compressor = createCompressor({ compression: 'zopfli' });
    const first = await compressor.compress(input);
    const baseline = await createCompressor({ compression: 'gzip' }).compress(input);
    assert.equal(compressor.encoding, 'gzip');
    assert.ok(first.length <= baseline.length);
    assert.deepEqual(gunzipSync(first), input);
    assert.deepEqual(await compressor.compress(input), first);
    assert.equal(first.readUInt32LE(4), 0);
    assert.equal(first[9], 255);
});

test('saved compression settings migrate legacy gzip and preserve Brotli quality zero', (t) => {
    // Windows sandbox temp directories deny rename-over-existing; the workspace supports it.
    const temporaryDirectory = fs.mkdtempSync(path.join(fileURLToPath(new URL('../', import.meta.url)), '.cc4es-compression-config-'));
    const originalLocalAppData = process.env.LOCALAPPDATA;
    const originalStateHome = process.env.XDG_STATE_HOME;
    process.env.LOCALAPPDATA = process.env.XDG_STATE_HOME = temporaryDirectory;
    t.mock.method(os, 'homedir', () => temporaryDirectory);
    t.after(() => {
        if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
        else process.env.LOCALAPPDATA = originalLocalAppData;
        if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
        else process.env.XDG_STATE_HOME = originalStateHome;
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });
    const configPath = getConfigFilePath();
    assert.ok(!path.relative(temporaryDirectory, configPath).startsWith('..'));
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: 2, gzipOptions: { gzip: true, gzipLevel: 6 } }));
    assert.equal(getLastCompressionOptions().compression, 'gzip');
    assert.equal(getLastCompressionOptions().gzipLevel, 6);
    const settings = resolveCompressionOptions({ compression: 'brotli', brotliQuality: 0 });
    assert.equal(saveLastBuildPaths('source', 'output', settings), true);
    assert.deepEqual(getLastCompressionOptions(), settings);
    assert.equal(JSON.parse(fs.readFileSync(configPath)).gzipOptions.gzip, false);
});

test('the GUI switches controls and submits the chosen compressor and parameters', async () => {
    const source = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
    const elements = new Map();
    const getElementById = id => {
        if (!elements.has(id)) elements.set(id, { value: '', checked: true, addEventListener() {} });
        return elements.get(id);
    };
    const requests = [];
    const context = vm.createContext({
        document: { getElementById }, window: { location: { port: '3000' }, addEventListener() {} }, console,
        fetch: async (url, options) => { requests.push([url, JSON.parse(options.body)]); return { json: async () => ({ success: false, message: 'test' }) }; },
        alert() {}, setTimeout() {}
    });
    vm.runInContext(script, context);
    for (const method of ['none', 'gzip', 'zopfli', 'brotli']) {
        getElementById('opt-compression').value = method;
        vm.runInContext('syncCompressionControls()', context);
        assert.equal(getElementById('gzip-level-control').hidden, method !== 'gzip' && method !== 'zopfli');
        assert.equal(getElementById('brotli-quality-control').hidden, method !== 'brotli');
        assert.equal(getElementById('zopfli-iterations-control').hidden, method !== 'zopfli');
        assert.equal(getElementById('brotli-note').hidden, method !== 'brotli');
    }
    getElementById('inputPath').value = 'source'; getElementById('outputPath').value = 'output.c';
    getElementById('opt-gzipLevel').value = '9'; getElementById('opt-brotliQuality').value = '0';
    getElementById('opt-zopfliIterations').value = '15';
    await vm.runInContext('startBuild()', context);
    assert.equal(requests[0][0], '/api/build');
    assert.equal(requests[0][1].compression, 'brotli');
    assert.equal(requests[0][1].brotliQuality, 0);
});
