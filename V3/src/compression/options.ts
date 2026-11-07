import { DEFAULT_GZIP_LEVEL, isGzipLevel } from '../gzip-options.js';

export const COMPRESSION_METHODS = ['none', 'gzip', 'brotli', 'zopfli'] as const;
export type CompressionMethod = typeof COMPRESSION_METHODS[number];

export interface CompressionOptions {
    compression?: CompressionMethod;
    gzip?: boolean;
    gzipLevel?: number;
    brotliQuality?: number;
    zopfliIterations?: number;
}

export interface CompressionSettings {
    compression: CompressionMethod;
    gzipLevel: number;
    brotliQuality: number;
    zopfliIterations: number;
}

export const DEFAULT_COMPRESSION_SETTINGS: Readonly<CompressionSettings> = {
    compression: 'brotli', gzipLevel: DEFAULT_GZIP_LEVEL, brotliQuality: 11, zopfliIterations: 15
};

export const isCompressionMethod = (value: unknown): value is CompressionMethod => {
    return COMPRESSION_METHODS.some(method => method === value);
};

const isIntegerInRange = (value: unknown, min: number, max: number): value is number => {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

export const resolveCompressionOptions = (value: unknown, defaults: Readonly<CompressionSettings> = DEFAULT_COMPRESSION_SETTINGS): CompressionSettings => {
    const options = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    if (options.gzip !== undefined && typeof options.gzip !== 'boolean') throw new Error('gzip must be a boolean.');
    const compression = options.compression ?? (options.gzip === undefined ? defaults.compression : options.gzip ? 'gzip' : 'none');
    const gzipLevel = options.gzipLevel ?? defaults.gzipLevel;
    const brotliQuality = options.brotliQuality ?? defaults.brotliQuality;
    const zopfliIterations = options.zopfliIterations ?? defaults.zopfliIterations;
    if (! isCompressionMethod(compression)) throw new Error('compression must be none, gzip, brotli or zopfli.');
    if (! isGzipLevel(gzipLevel)) throw new Error('gzipLevel must be an integer from 1 to 9.');
    if (! isIntegerInRange(brotliQuality, 0, 11)) throw new Error('brotliQuality must be an integer from 0 to 11.');
    if (! isIntegerInRange(zopfliIterations, 1, 100)) throw new Error('zopfliIterations must be an integer from 1 to 100.');
    return { compression, gzipLevel, brotliQuality, zopfliIterations };
};
