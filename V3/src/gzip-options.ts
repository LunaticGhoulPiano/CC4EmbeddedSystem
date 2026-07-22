export const DEFAULT_GZIP_LEVEL = 9;

export interface GzipBuildOptions {
    gzip: boolean;
    gzipLevel: number;
}

export const isGzipLevel = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9;
};

export const getDefaultGzipBuildOptions = (): GzipBuildOptions => {
    return {
        gzip: false,
        gzipLevel: DEFAULT_GZIP_LEVEL
    };
};
