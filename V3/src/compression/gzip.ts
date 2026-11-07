import { gzipSync } from 'node:zlib';
import type { Compressor } from './types.js';

export const createGzipCompressor = (level: number): Compressor => ({
    encoding: 'gzip',
    description: `gzip level ${level}`,
    async compress(content) {
        const compressed = gzipSync(content, { level });
        // RFC 1952: normalize the timestamp and operating-system metadata.
        compressed.fill(0, 4, 8);
        compressed[9] = 0xff;
        return compressed;
    }
});
