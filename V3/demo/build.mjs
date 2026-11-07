import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runMakeFsData } from '../dist/makefsdata.js';
import { assetPath, compressions, demoPath, outputPath, selectProjects, walkFiles } from './projects.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function validateAssets(project) {
    const manifest = JSON.parse(fs.readFileSync(demoPath('.cache', 'manifests', `${project.name}.json`), 'utf8'));
    assert.equal(manifest.revision, project.sha, 'Prepared revision differs from pinned revision.');
    const files = walkFiles(assetPath(project));
    assert.equal(files.length, manifest.files.length, 'Prepared asset list changed. Run demo:prepare again.');
    for (const item of manifest.files) {
        const bytes = fs.readFileSync(path.join(assetPath(project), item.url));
        assert.equal(sha256(bytes), item.sha256, `Prepared asset changed: ${item.url}`);
    }
}

export async function buildProject(project, method = 'gzip') {
    const destination = outputPath(project, method);
    validateAssets(project);
    // Upstream already builds production assets. Preserve those exact bytes in
    // every mode so compressed C can be compared directly with raw C and source.
    console.log(`Building ${project.name}: ${method}...`);
    const started = performance.now();
    const stats = await runMakeFsData({
        inputDir: assetPath(project), outputFile: destination, processSubs: true,
        includeHttpHeader: true, useHttp11: true, supportSsi: false, precalcChksum: false,
        minifyOpts: false, optimizeSvg: false, ...compressions[method].options
    });
    console.log(`${project.name} ${method}: ${stats.filesCount} files, ${stats.storedSize} stored bytes, ${((performance.now() - started) / 1000).toFixed(2)} s.`);
    return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: { project: { type: 'string', default: 'all' }, compression: { type: 'string', default: 'all' } } });
    try {
        const methods = values.compression === 'all' ? Object.keys(compressions) : [values.compression];
        for (const method of methods) if (!Object.hasOwn(compressions, method)) throw new Error(`Unknown compression: ${method}`);
        for (const project of selectProjects(values.project)) {
            for (const method of methods) await buildProject(project, method);
        }
    } catch (error) { console.error(error); process.exitCode = 1; }
}
