#!/usr/bin/env node

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
import express from 'express'; 
import open from 'open';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { runMakeFsData, MakeFsDataOptions } from './makefsdata.js'; 

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);
const app = express();

// port default: 3000
let PORT: number = parseInt(process.env.PORT || '3000', 10);
const portArgIndex = process.argv.indexOf('--port');
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsedPort = parseInt(process.argv[portArgIndex + 1]!, 10);
    if (!isNaN(parsedPort)) PORT = parsedPort;
}

let server: any;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// get current version
const getPackageVersion = (): string => {
    try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        return pkg.version || "0.0.0";
    }
    catch {
        return "3.0.1";
    }
};

app.get('/api/version', (_req: express.Request, res: express.Response) => {
    res.json({ version: getPackageVersion() });
});

// main
app.post('/api/build', async (req: express.Request, res: express.Response) => {
    // get minifyOpts
    const { inputPath, outputPath, minifyOpts } = req.body;
    const opts: MakeFsDataOptions = {
        inputDir: inputPath,
        outputFile: outputPath,
        processSubs: true,
        includeHttpHeader: true,
        useHttp11: false,
        supportSsi: true,
        precalcChksum: false,
        minifyOpts: minifyOpts
    };

    try {
        await runMakeFsData(opts);
        await open(path.dirname(outputPath));
        res.json({ success: true });
    }
    catch (error: any) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/shutdown', (_req: express.Request, res: express.Response) => {
    console.log('👋 Window closed, shutting down ...');
    res.json({ success: true });
    setTimeout(() => { process.exit(0); }, 500);
});

app.post('/api/change-port', (req: express.Request, res: express.Response): void => {
    const parsedPort = parseInt(req.body.newPort, 10);
    
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        res.json({ success: false, message: 'Invalid port number.' });
        return; 
    }

    res.json({ success: true });

    // restart
    setTimeout(() => {
        if (server) {
            server.closeAllConnections(); 
            server.close(() => {
                PORT = parsedPort;
                server = app.listen(PORT, () => {
                    console.log(`🔄 Server successfully restarted on port ${PORT}`);
                });
            });
        }
    }, 100);
});

server = app.listen(PORT, async () => {
    console.log(`✨ GUI Server started! Opening in browser...`);
    await open(`http://localhost:${PORT}`);
});