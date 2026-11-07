import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';

import { CliUsageError, getHelpText, parseCliArguments } from '../dist/cli.js';
import { DEFAULT_HTML_MINIFY_OPTIONS } from '../dist/minify-options.js';
import { runMakeFsData } from '../dist/makefsdata.js';
import { extractResponse } from '../demo/fsdata.mjs';

const createBuildOptions = (inputDir, outputFile, overrides = {}) => {
    return {
        inputDir,
        outputFile,
        processSubs: true,
        includeHttpHeader: true,
        useHttp11: false,
        supportSsi: true,
        precalcChksum: false,
        minifyOpts: { ...DEFAULT_HTML_MINIFY_OPTIONS },
        optimizeSvg: false,
        svgoMultipass: false,
        gzip: false,
        ...overrides
    };
};

test('CLI exposes and validates gzip options', () => {
    const parsed = parseCliArguments(['--headless', '--src', 'src', '--gzip', '--gzip-level', '9']);
    assert.equal(parsed.gzip, true);
    assert.equal(parsed.gzipLevel, 9);
    assert.match(getHelpText(), /--\[no-\]gzip/);
    assert.match(getHelpText(), /--gzip-level <1-9>/);

    for (const invalidLevel of ['0', '10', '1.5', 'text']) {
        assert.throws(
            () => parseCliArguments(['--headless', '--src', 'src', '--gzip-level', invalidLevel]),
            CliUsageError
        );
    }

    assert.throws(
        () => parseCliArguments(['--headless', '--src', 'src', '--gzip-level']),
        CliUsageError
    );
});

test('generator defaults to Brotli quality 11 when compression is omitted', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-default-brotli-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const inputDirectory = path.join(temporaryDirectory, 'input');
    fs.mkdirSync(inputDirectory);
    const content = Buffer.from('Default Brotli resource: 測試 🌏\n'.repeat(100));
    fs.writeFileSync(path.join(inputDirectory, 'page.txt'), content);
    const outputFile = path.join(temporaryDirectory, 'fsdata.c');
    const options = createBuildOptions(inputDirectory, outputFile, { useHttp11: true });
    delete options.gzip;
    const stats = await runMakeFsData(options);
    const response = extractResponse(outputFile, '_page_txt');
    const expected = brotliCompressSync(content, { params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length
    } });
    assert.equal(response.headers['content-encoding'], 'br');
    assert.equal(response.headers['content-length'], String(expected.length));
    assert.deepEqual(response.body, expected);
    assert.deepEqual(brotliDecompressSync(response.body), content);
    assert.equal(stats.brotliFilesCount, 1);
});

test('generator keeps JavaScript comment wrappers out of the HTML minifier', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-js-routing-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const inputDirectory = path.join(temporaryDirectory, 'input');
    const outputFile = path.join(temporaryDirectory, 'fsdata.c');
    fs.mkdirSync(inputDirectory);
    fs.writeFileSync(path.join(inputDirectory, 'app.js'), '<!--\n(() => { console.log("comment wrapper survives"); })();\n//-->\n');

    await runMakeFsData(createBuildOptions(inputDirectory, outputFile));

    const response = extractResponse(outputFile, '_app_js');
    assert.doesNotMatch(response.header, /Content-Encoding: gzip/);
    assert.notEqual(response.body.length, 0);
    assert.match(response.body.toString('utf8'), /comment wrapper survives/);
});

test('gzip stores only smaller candidate bodies and is deterministic', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-gzip-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const inputDirectory = path.join(temporaryDirectory, 'input');
    const rawOutputFile = path.join(temporaryDirectory, 'raw.c');
    const gzipOutputFile = path.join(temporaryDirectory, 'gzip.c');
    const repeatedText = 'gzip fixture content '.repeat(200);
    fs.mkdirSync(inputDirectory);
    fs.writeFileSync(path.join(inputDirectory, 'app.js'), `const text = '${repeatedText}';\n`);
    fs.writeFileSync(path.join(inputDirectory, 'tiny.txt'), 'tiny\n');
    fs.writeFileSync(path.join(inputDirectory, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const noJavaScriptMinify = {
        minifyOpts: { ...DEFAULT_HTML_MINIFY_OPTIONS, minifyJS: false }
    };
    await runMakeFsData(createBuildOptions(inputDirectory, rawOutputFile, noJavaScriptMinify));
    const rawApp = extractResponse(rawOutputFile, '_app_js');

    const gzipStats = await runMakeFsData(createBuildOptions(inputDirectory, gzipOutputFile, {
        ...noJavaScriptMinify,
        gzip: true,
        gzipLevel: 9
    }));
    const gzipApp = extractResponse(gzipOutputFile, '_app_js');
    const tinyText = extractResponse(gzipOutputFile, '_tiny_txt');
    const image = extractResponse(gzipOutputFile, '_image_png');

    assert.equal(gzipStats.gzipFilesCount, 1);
    assert.match(gzipApp.header, /Content-Encoding: gzip/);
    assert.deepEqual(gzipApp.body.subarray(0, 2), Buffer.from([0x1f, 0x8b]));
    assert.deepEqual(gunzipSync(gzipApp.body), rawApp.body);
    assert.doesNotMatch(tinyText.header, /Content-Encoding: gzip/);
    assert.deepEqual(tinyText.body, Buffer.from('tiny\n'));
    assert.doesNotMatch(image.header, /Content-Encoding: gzip/);
    assert.deepEqual(image.body, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const deterministicOutputFile = path.join(temporaryDirectory, 'gzip-again.c');
    await runMakeFsData(createBuildOptions(inputDirectory, deterministicOutputFile, {
        ...noJavaScriptMinify,
        gzip: true,
        gzipLevel: 9
    }));
    assert.deepEqual(fs.readFileSync(gzipOutputFile), fs.readFileSync(deterministicOutputFile));
});

test('CSS uses a CSS minifier instead of the HTML minifier', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-css-routing-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const inputDirectory = path.join(temporaryDirectory, 'input');
    const outputFile = path.join(temporaryDirectory, 'fsdata.c');
    fs.mkdirSync(inputDirectory);
    fs.writeFileSync(path.join(inputDirectory, 'style.css'), 'body { color: red; /* removable comment */ }\n');

    await runMakeFsData(createBuildOptions(inputDirectory, outputFile));

    const response = extractResponse(outputFile, '_style_css');
    assert.doesNotMatch(response.body.toString('utf8'), /removable comment/);
    assert.match(response.body.toString('utf8'), /body\{color:red\}/);
});

test('redirhome keeps its legacy link target with and without a real page', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-redirhome-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

    const input = path.join(temporaryDirectory, 'input');
    const output = path.join(temporaryDirectory, 'fsdata.c');
    fs.mkdirSync(input);
    fs.writeFileSync(path.join(input, 'index.html'), '<p>Home</p>');

    const options = createBuildOptions(input, output, { precalcChksum: true });
    await runMakeFsData(options);
    const absent = fs.readFileSync(output, 'utf8');
    assert.match(absent, /static const unsigned char data__redirhome_html\[\] = \{\s*0\s*};/);
    assert.match(absent, /const struct fsdata_file file__redirhome_html\[\] = \{ \{\s*file_NULL,\s*data__redirhome_html,\s*data__redirhome_html,\s*0,\s*1,\s*#if HTTPD_PRECALCULATED_CHECKSUM\s*0, NULL,/);
    assert.match(absent, /file__index_html\[\] = \{ \{\s*file__redirhome_html,/);
    assert.match(absent, /#define FS_ROOT file__index_html\n#define FS_NUMFILES 2\b/);

    fs.writeFileSync(path.join(input, 'redirhome.html'), '<p>Restart</p>');
    await runMakeFsData(options);
    const present = fs.readFileSync(output, 'utf8');
    assert.match(present, /#define FS_ROOT file__redirhome_html\n#define FS_NUMFILES 2\b/);
    assert.match(present, /file__redirhome_html\[\] = \{ \{\s*file__index_html,/);
    assert.match(present, /file__index_html\[\] = \{ \{\s*file_NULL,/);
    assert.match(extractResponse(output, '_redirhome_html').body.toString('utf8'), /Restart/);
});

test('rebuilding inside the source directory excludes the previous output', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-output-exclusion-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const content = Buffer.from('Source content stays the same. '.repeat(100));

    for (const gzip of [false, true]) {
        const inputDirectory = path.join(temporaryDirectory, gzip ? 'gzip' : 'raw');
        fs.mkdirSync(inputDirectory);
        fs.writeFileSync(path.join(inputDirectory, 'page.txt'), content);

        // Exercise both an output directory and an auto-appended .c suffix.
        const destination = gzip ? path.join(inputDirectory, 'generated', 'fsdata') : inputDirectory;
        const options = createBuildOptions(inputDirectory, destination, { gzip });
        const firstStats = await runMakeFsData(options);
        const firstOutput = fs.readFileSync(options.outputFile);
        const secondStats = await runMakeFsData(options);

        assert.equal(firstStats.filesCount, 1);
        assert.equal(firstStats.originalSize, content.length);
        assert.deepEqual(secondStats, firstStats);
        assert.deepEqual(fs.readFileSync(options.outputFile), firstOutput);
        const response = extractResponse(options.outputFile, '_page_txt');
        assert.deepEqual(gzip ? gunzipSync(response.body) : response.body, content);
    }
});

test('symbol collisions fail before replacing the output or creating directories', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-symbol-collision-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const cases = [
        ['a-b.js', 'a_b.js'],
        ['a/b.js', 'a_b.js'],
        ['redirhome_html'],
        ['redirhome.html', 'redirhome_html']
    ];

    for (const [index, names] of cases.entries()) {
        const inputDirectory = path.join(temporaryDirectory, String(index));
        for (const name of names) {
            const filePath = path.join(inputDirectory, name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, 'Original source');
        }

        const existingOutput = path.join(temporaryDirectory, `${index}.c`);
        const previousOutput = 'Previously generated output';
        fs.writeFileSync(existingOutput, previousOutput);
        const validateError = (error) => {
            assert.match(error.message, /C symbol collision:/);
            for (const name of names) assert.ok(error.message.includes(`/${name}`));
            return true;
        };
        await assert.rejects(runMakeFsData(createBuildOptions(inputDirectory, existingOutput)), validateError);
        assert.equal(fs.readFileSync(existingOutput, 'utf8'), previousOutput);

        const newOutputDirectory = path.join(temporaryDirectory, `not-created-${index}`);
        await assert.rejects(
            runMakeFsData(createBuildOptions(inputDirectory, path.join(newOutputDirectory, 'fsdata.c'))),
            validateError
        );
        assert.equal(fs.existsSync(newOutputDirectory), false);
        for (const name of names) assert.equal(fs.readFileSync(path.join(inputDirectory, name), 'utf8'), 'Original source');
    }
});

test('a build reads the package version once for all HTTP headers', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-version-read-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const inputDirectory = path.join(temporaryDirectory, 'input');
    const outputFile = path.join(temporaryDirectory, 'fsdata.c');
    fs.mkdirSync(inputDirectory);
    for (const name of ['a', 'b', 'c']) fs.writeFileSync(path.join(inputDirectory, `${name}.txt`), name);

    const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
    const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
    const readFileSync = fs.readFileSync;
    let versionReads = 0;
    t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
        if (typeof filePath === 'string' && path.relative(filePath, packagePath) === '') versionReads++;
        return readFileSync(filePath, ...args);
    });

    await runMakeFsData(createBuildOptions(inputDirectory, outputFile));
    assert.equal(versionReads, 1);
    assert.equal(fs.readFileSync(outputFile, 'utf8').split(`CC4EmbeddedSystem V3 (${version})`).length - 1, 3);
    for (const name of ['a', 'b', 'c']) {
        const response = extractResponse(outputFile, `_${name}_txt`);
        assert.equal(response.header, 'HTTP/1.0 200 OK\r\nContent-type: text/plain\r\n\r\n');
        assert.equal(response.body.toString('utf8'), name);
    }

    await runMakeFsData(createBuildOptions(inputDirectory, outputFile, { includeHttpHeader: false }));
    assert.equal(versionReads, 1, 'A headerless build must not read the version');
});

test('pure conversion preserves source bytes without parsing or optimizing content', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-raw-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const inputDirectory = path.join(temporaryDirectory, 'input');
    fs.mkdirSync(inputDirectory);
    const files = {
        'page.html': Buffer.from('\uFEFF<!doctype html>\r\n<!-- keep -->\r\n<html><head><meta charset="utf-8" /></head><body>  測試 🌏  </body></html>\r\n'),
        'app.js': Buffer.from('// keep this comment\r\nconst value = 1 + 2;\r\n'),
        'theme.css': Buffer.from('/* keep this comment */\r\nbody { color: red; }\r\n'),
        'icon.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><!-- keep --><rect width="10" height="10" /></svg>\r\n'),
        'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255])
    };
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(inputDirectory, name), bytes);
    const outputFile = path.join(temporaryDirectory, 'fsdata_raw.c');
    const stats = await runMakeFsData(createBuildOptions(inputDirectory, outputFile, {
        compression: 'none', minifyOpts: false, optimizeSvg: true
    }));
    for (const [name, bytes] of Object.entries(files)) {
        const response = extractResponse(outputFile, '_' + name.replace(/\./g, '_'));
        assert.equal(response.headers['content-encoding'], undefined);
        assert.deepEqual(response.body, bytes, name);
    }
    assert.equal(stats.filesCount, Object.keys(files).length);
    assert.equal(stats.encodedFilesCount, 0);
    assert.equal(stats.storedSize, stats.originalSize);
});

test('new compressors feed final bytes, encodings and lengths into the C generator', async (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc4es-new-compressors-'));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const inputDirectory = path.join(temporaryDirectory, 'input');
    fs.mkdirSync(inputDirectory);
    const content = Buffer.from('A UTF-8 text resource: 測試 🌏\n'.repeat(100));
    fs.writeFileSync(path.join(inputDirectory, 'page.txt'), content);
    fs.writeFileSync(path.join(inputDirectory, 'tiny.txt'), 'x');
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fs.writeFileSync(path.join(inputDirectory, 'image.png'), binary);
    for (const compression of ['brotli', 'zopfli']) {
        const outputFile = path.join(temporaryDirectory, `${compression}.c`);
        const options = createBuildOptions(inputDirectory, outputFile, { compression, useHttp11: true });
        const stats = await runMakeFsData(options);
        const firstOutput = fs.readFileSync(outputFile);
        const page = extractResponse(outputFile, '_page_txt');
        const encoding = compression === 'brotli' ? 'br' : 'gzip';
        assert.ok(page.header.includes(`Content-Encoding: ${encoding}\r\n`));
        assert.ok(page.header.includes(`Content-Length: ${page.body.length}\r\n`));
        assert.deepEqual(compression === 'brotli' ? brotliDecompressSync(page.body) : gunzipSync(page.body), content);
        assert.doesNotMatch(extractResponse(outputFile, '_tiny_txt').header, /Content-Encoding/);
        assert.deepEqual(extractResponse(outputFile, '_image_png').body, binary);
        assert.equal(stats.encodedFilesCount, 1);
        assert.equal(stats.gzipFilesCount, compression === 'zopfli' ? 1 : 0);
        assert.equal(stats.brotliFilesCount, compression === 'brotli' ? 1 : 0);
        assert.equal(stats.storedSize, page.body.length + 1 + binary.length);
        await runMakeFsData(options);
        assert.deepEqual(fs.readFileSync(outputFile), firstOutput);
    }
});
