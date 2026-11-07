import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assetPath, compressions, outputPath, projects, walkFiles } from './projects.mjs';
import { decodedBody, readFsData } from './fsdata.mjs';

for (const project of projects) {
    test(`${project.name}: raw C preserves every production asset`, async t => {
        const sourceDirectory = assetPath(project);
        assert.ok(fs.existsSync(sourceDirectory), 'Prepared assets are missing. Run npm run demo:prepare first.');
        const rawFile = outputPath(project, 'none');
        assert.ok(fs.existsSync(rawFile), 'Raw C is missing. Run npm run demo:build first.');
        const sources = walkFiles(sourceDirectory).map(file => ({
            file, url: '/' + path.relative(sourceDirectory, file).split(path.sep).join('/')
        }));
        const raw = readFsData(rawFile);
        assert.deepEqual([...raw.keys()].sort(), sources.map(source => source.url).sort());
        for (const source of sources) {
            const response = raw.get(source.url);
            assert.equal(response.headers['content-encoding'], undefined, `${source.url}: raw must not be encoded`);
            assert.equal(response.headers['content-length'], String(response.body.length), `${source.url}: raw Content-Length`);
            assert.deepEqual(response.body, fs.readFileSync(source.file), `${source.url}: raw differs from source`);
        }

        for (const method of Object.keys(compressions).filter(method => method !== 'none')) {
            await t.test(`${method}: decoded C matches raw C`, () => {
                const file = outputPath(project, method);
                assert.ok(fs.existsSync(file), `${method} C is missing. Run npm run demo:build first.`);
                const compressed = readFsData(file);
                assert.deepEqual([...compressed.keys()].sort(), [...raw.keys()].sort());
                let encodedFiles = 0;
                for (const [url, response] of compressed) {
                    const original = raw.get(url);
                    const encoding = response.headers['content-encoding'];
                    if (encoding !== undefined) {
                        assert.equal(encoding, method === 'brotli' ? 'br' : 'gzip', `${url}: Content-Encoding`);
                        assert.ok(response.body.length < original.body.length, `${url}: encoded body is not smaller`);
                        encodedFiles++;
                    } else {
                        assert.deepEqual(response.body, original.body, `${url}: identity fallback changed bytes`);
                    }
                    assert.equal(response.headers['content-length'], String(response.body.length), `${url}: Content-Length`);
                    assert.equal(response.status, original.status, `${url}: HTTP status changed`);
                    assert.equal(response.headers['content-type'], original.headers['content-type'], `${url}: MIME type changed`);
                    assert.deepEqual(decodedBody(response), original.body, `${url}: decoded body differs from raw`);
                }
                assert.ok(encodedFiles > 0, `${method}: no asset was actually compressed`);
            });
        }
    });
}
