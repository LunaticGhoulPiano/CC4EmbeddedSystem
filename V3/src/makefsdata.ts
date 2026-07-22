/*
 * ==============================================================================
 * CC4EmbeddedSystem V3 (makefsdata)
 * Copyright (c) 2026 LunaticGhoulPiano / Emile Su
 * Licensed under the MIT License.
 * ==============================================================================
 *
 * This software integrates concepts, logic, and minification processes derived 
 * from the following open-source projects. We deeply appreciate their work:
 *
 * ------------------------------------------------------------------------------
 * 1. lwIP (Lightweight TCP/IP stack)
 * Repository: https://github.com/m-labs/lwip
 * Copyright (c) 2001-2004 Swedish Institute of Computer Science.
 * All rights reserved.
 * * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products
 * derived from this software without specific prior written permission.
 * * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
 * OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY
 * OF SUCH DAMAGE.
 *
 * ------------------------------------------------------------------------------
 * 2. html-minifier-next
 * Repository: https://github.com/j9t/html-minifier-next
 * Copyright (c) Jens Oliver Meiert (html-minifier-next)
 * Copyright (c) Daniel Ruf (html-minifier-terser)
 * Copyright (c) Juriy "kangax" Zaytsev (html-minifier)
 * * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * ==============================================================================
 */

// modern ESM
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { transform as transformJavaScript } from 'esbuild';
import { minify } from 'html-minifier-next';
import { transform as transformCss } from 'lightningcss';
import { optimize } from 'svgo';
import { DEFAULT_GZIP_LEVEL, isGzipLevel } from './gzip-options.js';
import { getPackageVersion } from './utils.js';
import { DEFAULT_HTML_MINIFY_OPTIONS, HtmlMinifyOptions } from './minify-options.js';

// ----------------------------------------------------------------------
// 1. Configs & Version Recovery
// ----------------------------------------------------------------------
const TCP_MSS: number = 1460;
const LWIP_VERSION: string = "1.3.1"; // this makefsdata.ts is based on lwIP v1.3.1

export interface MakeFsDataOptions {
    inputDir: string;
    outputFile: string;
    processSubs: boolean;
    includeHttpHeader: boolean;
    useHttp11: boolean;
    supportSsi: boolean;
    precalcChksum: boolean;
    minifyOpts?: HtmlMinifyOptions;
    optimizeSvg?: boolean;
    svgoMultipass?: boolean;
    gzip?: boolean;
    gzipLevel?: number;
}

// ----------------------------------------------------------------------
// 2. Structures
// ----------------------------------------------------------------------
interface ChksumBlock { offset: number; chksum: number; len: number; }
interface HeaderPart { str: string; buf: Buffer; }
interface FileEntry {
    varName: string; pathName: string; nameBuffer: Buffer;
    headerParts: HeaderPart[]; headerTotalBuffer: Buffer;
    contentBuffer: Buffer; chksums: ChksumBlock[];
    rawContentLength: number; contentEncoding?: 'gzip'; compressionNote?: string;
}

const REDIRHOME_PATH = '/redirhome.html';
const GZIP_CANDIDATE_EXTENSIONS = new Set([
    '.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt', '.map'
]);

// ----------------------------------------------------------------------
// 3. lwIP Helpers
// ----------------------------------------------------------------------
function getMimeType(fileName: string): string {
    const ext: string = path.extname(fileName).toLowerCase();
    switch (ext) {
        case '.html':
        case '.htm':
        case '.shtml':
        case '.shtm':
        case '.ssi': {
            return 'text/html';
        }

        case '.css':
            return 'text/css';
        case '.js':
        case '.mjs':
            return 'application/javascript';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        
        case '.jpg':
        case '.jpeg': {
            return 'image/jpeg';
        }
        
        case '.ico':
            return 'image/x-icon';
        case '.xml':
            return 'text/xml';
        case '.json':
        case '.map':
            return 'application/json';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'text/plain';
    }
}

function inetChksum(buf: Buffer): number {
    let sum: number = 0;
    for (let i = 0; i < buf.length; i += 2) {
        const b1: number | undefined = buf[i];
        const b2: number | undefined = (i + 1 < buf.length) ? buf[i + 1] : 0;
        
        if (b1 === undefined) continue;
        sum += (b1 << 8) | (b2 ?? 0);
    }
    
    while (sum >> 16) sum = (sum & 0xFFFF) + (sum >> 16);
    
    return (~sum) & 0xFFFF;
}

function generateHttpHeaders(fileName: string, dataLength: number, opts: MakeFsDataOptions, contentEncoding?: 'gzip'): { parts: HeaderPart[], totalBuffer: Buffer } {
    const parts: HeaderPart[] = [];
    const ccVersion = getPackageVersion();
    const addPart = (str: string) => { parts.push({ str, buf: Buffer.from(str, 'ascii') }); };

    const baseName: string = path.basename(fileName);
    const ext: string = path.extname(fileName).toLowerCase();
    
    const protocol: string = opts.useHttp11 ? "HTTP/1.1" : "HTTP/1.0";
    if (baseName.startsWith("404")) addPart(`${protocol} 404 File not found\r\n`);
    else if (baseName.startsWith("400")) addPart(`${protocol} 400 Bad Request\r\n`);
    else if (baseName.startsWith("501")) addPart(`${protocol} 501 Not Implemented\r\n`);
    else addPart(`${protocol} 200 OK\r\n`);

    const serverInfo = `Server: lwIP & CC4EmbeddedSystem V3\r\n` +
                       `lwIP (${LWIP_VERSION}): (http://savannah.nongnu.org/projects/lwip)\r\n` +
                       `CC4EmbeddedSystem V3 (${ccVersion}): https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem\r\n`;
    parts.push({ str: serverInfo, buf: Buffer.alloc(0) }); // addPart(serverInfo);

    let isSsi: boolean = false;
    if (opts.supportSsi && ['.shtml', '.shtm', '.ssi', '.xml'].includes(ext)) isSsi = true;

    if (opts.useHttp11) {
        if (! isSsi) {
            addPart(`Content-Length: ${dataLength}\r\n`);
            addPart(`Connection: keep-alive\r\n`);
        }
        else addPart(`Connection: close\r\n`);
    }

    if (contentEncoding === 'gzip') {
        addPart(`Content-type: ${getMimeType(fileName)}\r\n`);
        addPart('Content-Encoding: gzip\r\n');
        addPart('\r\n');
    }
    else addPart(`Content-type: ${getMimeType(fileName)}\r\n\r\n`);
    
    return { parts, totalBuffer: Buffer.concat(parts.map(p => p.buf)) };
}

function getFilesRecursive(dir: string, processSubs: boolean, sortEntries: boolean): string[] {
    const results: string[] = [];
    if (! fs.existsSync(dir)) return results;
    const list: string[] = fs.readdirSync(dir);
    if (sortEntries) list.sort();
    
    for (const file of list) {
        const fullPath: string = path.join(dir, file);
        const stat: fs.Stats = fs.statSync(fullPath);
        if (! stat.isDirectory()) results.push(fullPath);
        else if (processSubs) results.push(...getFilesRecursive(fullPath, processSubs, sortEntries));
    }

    return results;
}

function bufferToHexCArray(buf: Buffer): string {
    let out = '';
    for (let i = 0; i < buf.length; i++) {
        if (i % 16 === 0) out += '\t';
        const b: number | undefined = buf[i];
        if (b === undefined) continue;
        out += `0x${b.toString(16).padStart(2, '0')},`;
        if ((i + 1) % 16 === 0) out += '\n';
    }

    if (!out.endsWith('\n')) out += '\n';
    
    return out;
}

// ----------------------------------------------------------------------
// 4. export API
// ----------------------------------------------------------------------

export interface BuildStats {
    originalSize: number;
    compressedSize: number;
    storedSize: number;
    convertedSize: number;
    filesCount: number;
    gzipFilesCount: number;
}

function gzipDeterministic(content: Buffer, gzipLevel: number): Buffer {
    const compressed = gzipSync(content, { level: gzipLevel });

    // RFC 1952 mtime and OS fields: avoid build-time and host-specific metadata.
    compressed.fill(0, 4, 8);
    compressed[9] = 0xff;
    return compressed;
}

async function optimizeContent(filePath: string, relativePath: string, content: Buffer, minifyOpts: HtmlMinifyOptions, opts: MakeFsDataOptions): Promise<Buffer> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.svg' && opts.optimizeSvg !== false) {
        try {
            const optimizedSvg = optimize(content.toString('utf8'), {
                path: filePath,
                multipass: opts.svgoMultipass ?? false
            });
            const optimizedContent = Buffer.from(optimizedSvg.data, 'utf8');
            console.log(`🖼️ Optimized SVG: ${relativePath} (${content.length} -> ${optimizedContent.length} bytes)`);
            return optimizedContent;
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to optimize SVG ${relativePath}: ${message}`);
        }
    }

    if (['.html', '.htm'].includes(ext)) {
        const minifiedHtml = await minify(content.toString('utf8'), minifyOpts);
        if (typeof minifiedHtml === 'string') {
            const optimizedContent = Buffer.from(minifiedHtml, 'utf8');
            console.log(`📦 Minified HTML: ${relativePath} (${content.length} -> ${optimizedContent.length} bytes)`);
            return optimizedContent;
        }
    }

    if (ext === '.css' && minifyOpts.minifyCSS) {
        try {
            const optimizedCss = transformCss({
                filename: filePath,
                code: content,
                minify: true
            });
            const optimizedContent = Buffer.from(optimizedCss.code);
            console.log(`🎨 Minified CSS: ${relativePath} (${content.length} -> ${optimizedContent.length} bytes)`);
            return optimizedContent;
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to minify CSS ${relativePath}: ${message}`);
        }
    }

    if (['.js', '.mjs'].includes(ext) && minifyOpts.minifyJS) {
        try {
            const optimizedJs = await transformJavaScript(content.toString('utf8'), {
                loader: 'js',
                minify: true,
                legalComments: 'none',
                sourcefile: filePath
            });
            const optimizedContent = Buffer.from(optimizedJs.code, 'utf8');
            console.log(`📦 Minified JavaScript: ${relativePath} (${content.length} -> ${optimizedContent.length} bytes)`);
            return optimizedContent;
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to minify JavaScript ${relativePath}: ${message}`);
        }
    }

    console.log(`📄 Copied: ${relativePath}`);
    return content;
}

export async function runMakeFsData(opts: MakeFsDataOptions): Promise<BuildStats> {
    console.log(`🚀 CC4EmbeddedSystem V3: Starting makefsdata compilation...`);
    
    // Check source directory before making any output directory changes.
    if (! fs.existsSync(opts.inputDir)) {
        throw new Error(`Input directory not found: ${path.resolve(opts.inputDir)}`);
    }

    if (! fs.statSync(opts.inputDir).isDirectory()) throw new Error(`Input path is not a directory: ${path.resolve(opts.inputDir)}`);

    if (fs.existsSync(opts.outputFile) && fs.statSync(opts.outputFile).isDirectory()) {
        opts.outputFile = path.join(opts.outputFile, 'fsdata.c');
        console.log(`🔧 Output directory selected. Using default file -> ${opts.outputFile}`);
    }
    else if (!opts.outputFile.toLowerCase().endsWith('.c')) {
        opts.outputFile += '.c';
        console.log(`🔧 Auto-appended '.c' to output file -> ${opts.outputFile}`);
    }

    const outDir = path.dirname(opts.outputFile);
    if (! fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const gzipEnabled = opts.gzip ?? false;
    const gzipLevel = opts.gzipLevel ?? DEFAULT_GZIP_LEVEL;
    if (! isGzipLevel(gzipLevel)) throw new Error('gzipLevel must be an integer from 1 to 9.');

    const allFiles = getFilesRecursive(opts.inputDir, opts.processSubs, gzipEnabled);
    const fileEntries: FileEntry[] = [];
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let totalStoredSize = 0;
    let gzipFilesCount = 0;

    if (allFiles.length === 0) throw new Error(`Input directory is empty! Please put your web files (.html, .css, etc.) into:\n${path.resolve(opts.inputDir)}`);

    const activeCompressOpts = opts.minifyOpts ?? DEFAULT_HTML_MINIFY_OPTIONS;

    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i]!;
        const relativePath = '/' + path.relative(opts.inputDir, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        let content: Buffer = fs.readFileSync(filePath);

        const originalFileSize = content.length;
        totalOriginalSize += originalFileSize;

        content = await optimizeContent(filePath, relativePath, content, activeCompressOpts, opts);
        const rawContentLength = content.length;
        totalCompressedSize += rawContentLength;

        let contentEncoding: 'gzip' | undefined;
        let compressionNote: string | undefined;
        if (gzipEnabled && GZIP_CANDIDATE_EXTENSIONS.has(ext)) {
            const gzipContent = gzipDeterministic(content, gzipLevel);
            if (gzipContent.length < content.length) {
                content = gzipContent;
                contentEncoding = 'gzip';
                gzipFilesCount++;

                const savedSize = rawContentLength - content.length;
                const savedPercent = ((savedSize / rawContentLength) * 100).toFixed(1);
                compressionNote = `gzip level ${gzipLevel}, original ${rawContentLength} B, stored ${content.length} B, saved ${savedSize} B (${savedPercent}%)`;
            }
            else compressionNote = `raw, original ${rawContentLength} B, gzip was not smaller`;
        }
        else if (gzipEnabled) compressionNote = 'raw, not a gzip candidate';

        totalStoredSize += content.length;

        // generate header
        const headerData = opts.includeHttpHeader ? generateHttpHeaders(filePath, content.length, opts, contentEncoding) : { parts: [], totalBuffer: Buffer.alloc(0) };
        const nameBuffer = Buffer.from(relativePath + '\0', 'utf8');
        const varName = relativePath.replace(/[^A-Za-z0-9]/g, '_');

        const chksums: ChksumBlock[] = [];
        if (opts.precalcChksum) {
            let offset = 0;
            
            if (headerData.totalBuffer.length > 0) {
                chksums.push({ offset: 0, chksum: inetChksum(headerData.totalBuffer), len: headerData.totalBuffer.length });
                offset += headerData.totalBuffer.length;
            }

            for (let chunkOffset = 0; chunkOffset < content.length; chunkOffset += TCP_MSS) {
                const chunkLen = Math.min(TCP_MSS, content.length - chunkOffset);
                chksums.push({ offset: offset, chksum: inetChksum(content.subarray(chunkOffset, chunkOffset + chunkLen)), len: chunkLen });
                offset += chunkLen;
            }
        }

        const fileEntry: FileEntry = {
            varName,
            pathName: relativePath,
            nameBuffer,
            headerParts: headerData.parts,
            headerTotalBuffer: headerData.totalBuffer,
            contentBuffer: content,
            chksums,
            rawContentLength
        };
        if (contentEncoding) fileEntry.contentEncoding = contentEncoding;
        if (compressionNote) fileEntry.compressionNote = compressionNote;
        fileEntries.push(fileEntry);
    }

    // find real redirhome.html
    const redirhomeIndex = fileEntries.findIndex(file => file.pathName.toLowerCase() === REDIRHOME_PATH);
    const hasRealRedirhome = redirhomeIndex >= 0;
    const orderedFileEntries = hasRealRedirhome
        ? fileEntries.slice(redirhomeIndex).concat(fileEntries.slice(0, redirhomeIndex))
        : fileEntries;

    if (hasRealRedirhome) console.log(`🔗 Bridge compatibility enabled: using ${REDIRHOME_PATH} as static chain head.`);

    // ====================================================================
    // C Code Generation
    // ====================================================================
    let cOutput: string = `/* Generated by CC4EmbeddedSystem V3 (makefsdata) */\n\n`;
    cOutput += `#include "fs.h"\n#include "lwip/def.h"\n#include "fsdata.h"\n\n\n`;
    cOutput += `#define file_NULL (struct fsdata_file *) NULL\n\n\n`;

    if (opts.precalcChksum) {
        cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n`;
        for (const file of orderedFileEntries) {
            cOutput += `const struct fsdata_chksum chksums_${file.varName}[] = {\n`;
            for (const chk of file.chksums) cOutput += `\t{${chk.offset}, 0x${chk.chksum.toString(16).padStart(4, '0')}, ${chk.len}},\n`;
            cOutput += `};\n`;
        }

        cOutput += `#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n\n\n`;
    }

    // generate data arrays
    for (const file of orderedFileEntries) {
        if (file.compressionNote) cOutput += `/* ${file.pathName}: ${file.compressionNote} */\n`;
        cOutput += `static const unsigned int dummy_align_${file.varName} = 0;\n`;
        cOutput += `static const unsigned char data_${file.varName}[] = {\n`;
        cOutput += `\t/* ${file.pathName} (${file.nameBuffer.length} chars) */\n`;
        cOutput += bufferToHexCArray(file.nameBuffer);
        
        if (file.headerParts.length > 0) {
            cOutput += `\n\t/* HTTP header */\n`;
            for (const part of file.headerParts) {
                let finalStr = part.str.replace(/\n/g, '\n\t');
                if (finalStr.endsWith('\t')) finalStr = finalStr.slice(0, -1);
                cOutput += `\t/* "${finalStr}\t" (${part.buf.length} bytes) */\n`;
                cOutput += bufferToHexCArray(part.buf);
            }
        }
        
        const contentDescription = file.contentEncoding === 'gzip' ? 'gzip file data' : 'raw file data';
        cOutput += `\n\t/* ${contentDescription} (${file.contentBuffer.length} bytes) */\n`;
        cOutput += bufferToHexCArray(file.contentBuffer);
        cOutput += `};\n\n\n\n`;
    }

    // if no real redirhome.html, generate empty arrays
    if (! hasRealRedirhome) {
        cOutput += `/* --- Empty arrays --- */\n`;
        cOutput += `static const unsigned char data__redirhome_html[] = {};\n`;
        cOutput += `const struct fsdata_file file__redirhome_html[] = { {\n`;
        cOutput += `\tfile_NULL,\n`;
        cOutput += `\tdata__redirhome_html,\n`;
        cOutput += `\tdata__redirhome_html + 16,\n`;
        cOutput += `\tsizeof(data__redirhome_html) - 16,\n`;
        cOutput += `\t1,\n`;

        if (opts.precalcChksum) cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n\t0, NULL,\n#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n`;
        cOutput += `}};\n\n\n`;
    }


    // generate linked-list
    for (let i = orderedFileEntries.length - 1; i >= 0; i--) {
        const current = orderedFileEntries[i]!;
        
        const nextVar = orderedFileEntries[i + 1]
            ? `file_${orderedFileEntries[i + 1]!.varName}`
            : (hasRealRedirhome ? 'file_NULL' : 'file__redirhome_html');
        const nameLen = current.nameBuffer.length;
        
        // address: e.g. "/index.html\0" = '/' + 'i' + 'n' + 'd' + 'e' + 'x' + '.' + 'h' + 't' + 'm' + 'l' + '\0' = 12
        cOutput += `const struct fsdata_file file_${current.varName}[] = { {\n`;
        cOutput += `\t${nextVar},\n\tdata_${current.varName},\n\tdata_${current.varName} + ${nameLen},\n\tsizeof(data_${current.varName}) - ${nameLen},\n\t${opts.includeHttpHeader ? 1 : 0},\n`; 
        
        if (opts.precalcChksum) cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n\t${current.chksums.length}, chksums_${current.varName},\n#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n`;
        cOutput += `}};\n\n`;
    }

    const rootNode = orderedFileEntries[0];
    if (rootNode) {
        cOutput += `#define FS_ROOT file_${rootNode.varName}\n#define FS_NUMFILES ${orderedFileEntries.length + (hasRealRedirhome ? 0 : 1)}\n`;
        fs.writeFileSync(opts.outputFile, cOutput);
        const convertedSize = fs.statSync(opts.outputFile).size;
        console.log(`\n✨ Success! Output written to: ${opts.outputFile}`);

        return {
            originalSize: totalOriginalSize,
            compressedSize: totalCompressedSize,
            storedSize: totalStoredSize,
            convertedSize: convertedSize,
            filesCount: orderedFileEntries.length,
            gzipFilesCount
        };
    }

    throw new Error("No files processed.");
}
