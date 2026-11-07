import fs from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

// Read byte arrays only; never evaluate or compile upstream/generated C code.
export function parseByteArrays(source) {
    const arrays = new Map();
    const declarations = /\bconst\s+(?:unsigned\s+char|uint8_t)\s+(\w+)\s*\[\s*\]\s*(?:PROGMEM\s*)?=\s*\{([\s\S]*?)\}\s*;/g;
    for (const match of source.matchAll(declarations)) {
        const body = match[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
        const bytes = Buffer.allocUnsafe(Math.max(1, Math.ceil(body.length / 2)));
        let size = 0;
        for (const literal of body.matchAll(/0x([0-9a-f]+)|\b(\d+)\b/gi)) {
            const value = Number.parseInt(literal[1] ?? literal[2], literal[1] === undefined ? 10 : 16);
            if (value > 255) throw new Error(`Non-byte literal in ${match[1]}.`);
            bytes[size++] = value;
        }
        if (arrays.has(match[1])) throw new Error(`Duplicate C array: ${match[1]}`);
        arrays.set(match[1], Buffer.from(bytes.subarray(0, size)));
    }
    return arrays;
}

export function parseResponse(data) {
    const nameEnd = data.indexOf(0);
    if (nameEnd < 0) throw new Error('Missing URL terminator.');
    const url = data.subarray(0, nameEnd).toString('utf8');
    if (!url) return undefined; // The legacy redirhome sentinel has no response.
    const response = data.subarray(nameEnd + 1);
    const headerEnd = response.indexOf('\r\n\r\n');
    if (headerEnd < 0) throw new Error(`Missing HTTP headers for ${url}.`);
    const headerBuffer = response.subarray(0, headerEnd + 4);
    const header = headerBuffer.toString('ascii');
    const lines = header.trimEnd().split('\r\n');
    const statusMatch = /^HTTP\/1\.[01] (\d{3})\b/.exec(lines.shift());
    if (!statusMatch) throw new Error(`Invalid HTTP status for ${url}.`);
    const headers = {};
    for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon < 1) throw new Error(`Invalid HTTP header for ${url}.`);
        headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
    }
    const body = response.subarray(headerEnd + 4);
    if (headers['content-length'] !== undefined && Number(headers['content-length']) !== body.length) {
        throw new Error(`Content-Length mismatch for ${url}.`);
    }
    return { url, status: Number(statusMatch[1]), headers, header, headerBuffer, body, arrayBytes: data.length };
}

export function readFsData(outputFile) {
    const responses = new Map();
    for (const [symbol, data] of parseByteArrays(fs.readFileSync(outputFile, 'utf8'))) {
        if (!symbol.startsWith('data_')) continue;
        const response = parseResponse(data);
        if (!response) continue;
        if (responses.has(response.url)) throw new Error(`Duplicate URL: ${response.url}`);
        responses.set(response.url, response);
    }
    if (!responses.size) throw new Error(`No HTTP assets in ${outputFile}.`);
    return responses;
}

export function decodedBody(response) {
    const encoding = response.headers['content-encoding'];
    if (!encoding) return response.body;
    if (encoding === 'gzip') return gunzipSync(response.body);
    if (encoding === 'br') return brotliDecompressSync(response.body);
    throw new Error(`Unsupported Content-Encoding: ${encoding}`);
}

export function getDataArray(outputFile, variableName) {
    const data = parseByteArrays(fs.readFileSync(outputFile, 'utf8')).get(`data_${variableName}`);
    if (!data) throw new Error(`Missing data array for ${variableName}`);
    return data;
}

export function extractResponse(outputFile, variableName) {
    const response = parseResponse(getDataArray(outputFile, variableName));
    if (!response) throw new Error(`No response for ${variableName}.`);
    return response;
}
