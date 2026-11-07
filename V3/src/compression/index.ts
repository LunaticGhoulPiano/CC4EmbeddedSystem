import path from 'node:path';
import { resolveCompressionOptions, type CompressionOptions } from './options.js';
import { createGzipCompressor } from './gzip.js';
import { createBrotliCompressor } from './brotli.js';
import { createZopfliCompressor } from './zopfli.js';
import type { Compressor, StoredContent } from './types.js';

export type { Compressor, ContentEncoding, StoredContent } from './types.js';
export { resolveCompressionOptions } from './options.js';
export type { CompressionOptions, CompressionSettings, CompressionMethod } from './options.js';

const CANDIDATE_EXTENSIONS = new Set([
    '.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt', '.map'
]);

export const createCompressor = (options: CompressionOptions): Compressor | undefined => {
    const settings = resolveCompressionOptions(options);
    switch (settings.compression) {
        case 'none': return undefined;
        case 'gzip': return createGzipCompressor(settings.gzipLevel);
        case 'brotli': return createBrotliCompressor(settings.brotliQuality);
        case 'zopfli': return createZopfliCompressor(settings.zopfliIterations, settings.gzipLevel);
    }
};

export const storeContent = async (content: Buffer, fileName: string, compressor?: Compressor): Promise<StoredContent> => {
    if (! compressor) return { body: content };
    if (! CANDIDATE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
        return { body: content, note: `raw, not a ${compressor.encoding} candidate` };
    }

    const compressed = await compressor.compress(content);
    if (compressed.length >= content.length) {
        return { body: content, note: `raw, original ${content.length} B, ${compressor.encoding} was not smaller` };
    }

    const savedSize = content.length - compressed.length;
    const savedPercent = ((savedSize / content.length) * 100).toFixed(1);
    return {
        body: compressed,
        encoding: compressor.encoding,
        note: `${compressor.description}, original ${content.length} B, stored ${compressed.length} B, saved ${savedSize} B (${savedPercent}%)`
    };
};
