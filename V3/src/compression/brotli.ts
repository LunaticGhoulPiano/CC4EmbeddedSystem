import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import type { Compressor } from './types.js';

const compress = promisify(brotliCompress);

export const createBrotliCompressor = (quality: number): Compressor => ({
    encoding: 'br',
    description: `brotli quality ${quality}`,
    async compress(content) {
        return compress(content, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: quality,
                [constants.BROTLI_PARAM_SIZE_HINT]: content.length
            }
        });
    }
});
