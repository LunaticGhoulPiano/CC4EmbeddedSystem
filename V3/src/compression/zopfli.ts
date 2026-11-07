import { crc32, gunzipSync } from 'node:zlib';
import { createGzipCompressor } from './gzip.js';
import { zopfliDeflate } from './zopfli-deflate.js';
import type { Compressor } from './types.js';

export const createZopfliCompressor = (iterations: number, gzipLevel: number): Compressor => ({
    encoding: 'gzip',
    description: `zopfli ${iterations} iterations (gzip level ${gzipLevel} fallback)`,
    async compress(content) {
        const deflated = zopfliDeflate(content, iterations);
        const header = Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff]);
        const trailer = Buffer.alloc(8);
        trailer.writeUInt32LE(crc32(content), 0);
        trailer.writeUInt32LE(content.length >>> 0, 4);
        const candidate = Buffer.concat([header, deflated, trailer]);
        // Check every custom-encoded stream before it can reach the C generator.
        if (!gunzipSync(candidate).equals(content)) throw new Error('Zopfli decompression did not reproduce the input bytes.');
        const baseline = await createGzipCompressor(gzipLevel).compress(content);
        return candidate.length < baseline.length ? candidate : baseline;
    }
});
