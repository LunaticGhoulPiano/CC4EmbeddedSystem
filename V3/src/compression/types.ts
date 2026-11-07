export type ContentEncoding = 'gzip' | 'br';

export interface Compressor {
    readonly encoding: ContentEncoding;
    readonly description: string;
    compress(content: Buffer): Promise<Buffer>;
}

export interface StoredContent {
    body: Buffer;
    encoding?: ContentEncoding;
    note?: string;
}
