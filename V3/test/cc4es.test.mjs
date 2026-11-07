import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { CliUsageError, getHelpText, parseCliArguments } from '../dist/cli.js';
import { DEFAULT_HTML_MINIFY_OPTIONS } from '../dist/minify-options.js';
import { runMakeFsData } from '../dist/makefsdata.js';

const getDataArray = (outputFile, variableName) => {
    const source = fs.readFileSync(outputFile, 'utf8');
    const declaration = `static const unsigned char data_${variableName}[] = {`;
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `Missing data array for ${variableName}`);

    const end = source.indexOf('\n};', start);
    assert.notEqual(end, -1, `Unterminated data array for ${variableName}`);

    const bytes = [...source.slice(start, end).matchAll(/0x([0-9a-f]{2})/g)].map((match) => Number.parseInt(match[1], 16));
    return Buffer.from(bytes);
};

const extractResponse = (outputFile, variableName) => {
    const data = getDataArray(outputFile, variableName);
    const nameEnd = data.indexOf(0);
    assert.notEqual(nameEnd, -1, `Missing URL terminator for ${variableName}`);

    const response = data.subarray(nameEnd + 1);
    const headerEnd = response.indexOf(Buffer.from('\r\n\r\n', 'ascii'));
    assert.notEqual(headerEnd, -1, `Missing HTTP header terminator for ${variableName}`);

    return {
        header: response.subarray(0, headerEnd + 4).toString('ascii'),
        body: response.subarray(headerEnd + 4)
    };
};

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
