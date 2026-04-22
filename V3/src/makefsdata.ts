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
import { minify } from 'html-minifier-next';

// ----------------------------------------------------------------------
// 1. Configs & Version Recovery
// ----------------------------------------------------------------------
const TCP_MSS: number = 1460;
const LWIP_VERSION: string = "1.3.1"; // this makefsdata.ts is based on lwIP v1.3.1

const getPackageVersion = (): string => {
    try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        return pkg.version || "0.0.0";
    }
    catch {
        return "v3.0.1";
    }
};

// html-minifier-next options
const COMPRESS_OPTS_DEFAULT = {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,
    minifyCSS: true,
    processConditionalComments: true,
    decodeEntities: true
};

export interface MakeFsDataOptions {
    inputDir: string;
    outputFile: string;
    processSubs: boolean;
    includeHttpHeader: boolean;
    useHttp11: boolean;
    supportSsi: boolean;
    precalcChksum: boolean;
    minifyOpts?: any; // customize
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
}

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
            return 'application/json';
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

function generateHttpHeaders(fileName: string, dataLength: number, opts: MakeFsDataOptions): { parts: HeaderPart[], totalBuffer: Buffer } {
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

    addPart(`Content-type: ${getMimeType(fileName)}\r\n\r\n`);
    
    return { parts, totalBuffer: Buffer.concat(parts.map(p => p.buf)) };
}

function getFilesRecursive(dir: string, processSubs: boolean): string[] {
    const results: string[] = [];
    if (! fs.existsSync(dir)) return results;
    const list: string[] = fs.readdirSync(dir);
    
    for (const file of list) {
        const fullPath: string = path.join(dir, file);
        const stat: fs.Stats = fs.statSync(fullPath);
        if (! stat.isDirectory()) results.push(fullPath);
        else if (processSubs) results.push(...getFilesRecursive(fullPath, processSubs));
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
export async function runMakeFsData(opts: MakeFsDataOptions): Promise<void> {
    console.log(`🚀 CC4EmbeddedSystem V3: Starting makefsdata compilation...`);
    
    // checkers
    if (! fs.existsSync(opts.inputDir)) {
        console.log(`⚠️ Input directory not found. Auto-creating directory: \n${opts.inputDir}`);
        fs.mkdirSync(opts.inputDir, { recursive: true });
    }

    if (!opts.outputFile.toLowerCase().endsWith('.c')) {
        opts.outputFile += '.c';
        console.log(`🔧 Auto-appended '.c' to output file -> ${opts.outputFile}`);
    }

    const outDir = path.dirname(opts.outputFile);
    if (! fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const allFiles = getFilesRecursive(opts.inputDir, opts.processSubs);
    const fileEntries: FileEntry[] = [];

    if (allFiles.length === 0) throw new Error(`Input directory is empty! Please put your web files (.html, .css, etc.) into:\n${path.resolve(opts.inputDir)}`);

    // html-minifier-next options
    const activeCompressOpts = opts.minifyOpts || COMPRESS_OPTS_DEFAULT;

    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i]!;
        const relativePath = '/' + path.relative(opts.inputDir, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        let content = fs.readFileSync(filePath);

        if (['.html', '.htm', '.css', '.js'].includes(ext)) {
            const minifiedStr = await minify(content.toString('utf8'), activeCompressOpts);

            if (typeof minifiedStr === 'string') {
                content = Buffer.from(minifiedStr, 'utf8');
                console.log(`📦 Minified: ${relativePath}`);
            }
        }
        else console.log(`📄 Copied: ${relativePath}`);

        // generate header
        const headerData = opts.includeHttpHeader ? generateHttpHeaders(filePath, content.length, opts) : { parts: [], totalBuffer: Buffer.alloc(0) };
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

        fileEntries.push({ varName, pathName: relativePath, nameBuffer, headerParts: headerData.parts, headerTotalBuffer: headerData.totalBuffer, contentBuffer: content, chksums });
    }

    // ====================================================================
    // C Code Generation
    // ====================================================================
    let cOutput: string = `/* Generated by CC4EmbeddedSystem V3 (makefsdata) */\n\n`;
    cOutput += `#include "fs.h"\n#include "lwip/def.h"\n#include "fsdata.h"\n\n\n`;
    cOutput += `#define file_NULL (struct fsdata_file *) NULL\n\n\n`;

    if (opts.precalcChksum) {
        cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n`;
        for (const file of fileEntries) {
            cOutput += `const struct fsdata_chksum chksums_${file.varName}[] = {\n`;
            for (const chk of file.chksums) cOutput += `\t{${chk.offset}, 0x${chk.chksum.toString(16).padStart(4, '0')}, ${chk.len}},\n`;
            cOutput += `};\n`;
        }

        cOutput += `#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n\n\n`;
    }

    // generate data arrays
    for (const file of fileEntries) {
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
        
        cOutput += `\n\t/* raw file data (${file.contentBuffer.length} bytes) */\n`;
        cOutput += bufferToHexCArray(file.contentBuffer);
        cOutput += `};\n\n\n\n`;
    }

    // redirhome.html
    cOutput += `/* --- Empty arrays --- */\n`;
    cOutput += `static const unsigned char data__redirhome_html[] = {};\n`;
    cOutput += `const struct fsdata_file file__redirhome_html[] = { {\n`;
    cOutput += `\tfile_NULL,\n`;
    cOutput += `\tdata__redirhome_html,\n`;
    cOutput += `\tdata__redirhome_html + 16,\n`;
    cOutput += `\tsizeof(data__redirhome_html) - 16,\n`;
    cOutput += `\t1,\n`;
    
    // checksum
    if (opts.precalcChksum) cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n\t0, NULL,\n#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n`;
    cOutput += `}};\n\n\n`;


    // generate linked-list
    for (let i = fileEntries.length - 1; i >= 0; i--) {
        const current = fileEntries[i]!;
        
        // last element didn't points to file_NULL but file__redirhome_html
        const nextVar = fileEntries[i + 1] ? `file_${fileEntries[i+1]!.varName}` : 'file__redirhome_html';
        const nameLen = current.nameBuffer.length;
        
        // address: e.g. "/index.html\0" = '/' + 'i' + 'n' + 'd' + 'e' + 'x' + '.' + 'h' + 't' + 'm' + 'l' + '\0' = 12
        cOutput += `const struct fsdata_file file_${current.varName}[] = { {\n`;
        cOutput += `\t${nextVar},\n\tdata_${current.varName},\n\tdata_${current.varName} + ${nameLen},\n\tsizeof(data_${current.varName}) - ${nameLen},\n\t${opts.includeHttpHeader ? 1 : 0},\n`; 
        
        if (opts.precalcChksum) cOutput += `#if HTTPD_PRECALCULATED_CHECKSUM\n\t${current.chksums.length}, chksums_${current.varName},\n#endif /* HTTPD_PRECALCULATED_CHECKSUM */\n`;
        cOutput += `}};\n\n`;
    }

    const rootNode = fileEntries[0];
    if (rootNode) {
        cOutput += `#define FS_ROOT file_${rootNode.varName}\n#define FS_NUMFILES ${fileEntries.length + 1}\n`;
        fs.writeFileSync(opts.outputFile, cOutput);
        console.log(`\n✨ Success! Output written to: ${opts.outputFile}`);
    }
}