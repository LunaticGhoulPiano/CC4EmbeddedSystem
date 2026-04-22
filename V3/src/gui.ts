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

import express from 'express'; 
import open from 'open';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMakeFsData, MakeFsDataOptions } from './makefsdata.js'; 
import { getPackageVersion } from './utils.js';
import { execFile, ChildProcess } from 'node:child_process';
import os from 'node:os';

// prevent socket errors
process.on('uncaughtException', (err: any) => {
    if (err.code === 'EADDRINUSE') return; 
    console.error('⚠️ Uncaught Error:', err);
});

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);
const app = express();

// port set by command
let PORT: number = parseInt(process.env.PORT || '3000', 10);
const portArgIndex = process.argv.indexOf('--port');
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsedPort = parseInt(process.argv[portArgIndex + 1]!, 10);
    if (!isNaN(parsedPort)) PORT = parsedPort;
}

let activeBrowseProcess: ChildProcess | null = null;
let server: any;
let shutdownTimer: NodeJS.Timeout | null = null;

app.use(express.json());
const publicPath = fs.existsSync(path.join(__dirname, 'public')) 
    ? path.join(__dirname, 'public') 
    : path.join(__dirname, '../public');

console.log(`[System] Serving static files from: ${publicPath}`);

app.use(express.static(publicPath));

const cancelShutdown = () => {
    if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
        // console.log('🛡️ Shutdown cancelled (keep alive)');
    }
};

const scheduleShutdown = () => {
    if (! shutdownTimer) {
        shutdownTimer = setTimeout(() => {
            closeBrowseProcess();
            console.log('👋 Window closed, shutting down ...');
            process.exit(0);
        }, 2000);
    }
};

const buildPowerShellArgs = (script: string): string[] => {
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

    return [
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        encodedCommand
    ];
};

const closeBrowseProcess = () => {
    if (activeBrowseProcess && ! activeBrowseProcess.killed) {
        try {
            activeBrowseProcess.kill();
        }
        catch (e) {
            // ignore child cleanup error
        }
    }

    activeBrowseProcess = null;
};

const runDialogCommand = (command: string, args: string[]): Promise<string> => {
    return new Promise((resolve, reject) => {
        const child = execFile(command, args, {
            windowsHide: false,
            maxBuffer: 1024 * 1024
        }, (error, stdout, stderr) => {
            if (activeBrowseProcess === child) activeBrowseProcess = null;

            if (error) {
                reject(new Error(stderr.trim() || error.message));
                return;
            }

            resolve(stdout.trim());
        });

        activeBrowseProcess = child;
    });
};

const buildWindowsDialogScript = (dialogLines: string[]): string => {
    return [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea',
        '$owner = New-Object System.Windows.Forms.Form',
        '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual',
        '$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None',
        '$owner.ShowInTaskbar = $false',
        '$owner.TopMost = $true',
        '$owner.Width = 1',
        '$owner.Height = 1',
        '$owner.Left = $screen.Left + [int]($screen.Width / 2)',
        '$owner.Top = $screen.Top + [int]($screen.Height / 2)',
        '$owner.Opacity = 0',
        '$null = $owner.Show()',
        '$null = $owner.Activate()',
        '$owner.BringToFront()',
        '[System.Windows.Forms.Application]::DoEvents()',
        ...dialogLines,
        '$owner.Close()',
        '$owner.Dispose()'
    ].join('\n');
};

app.get('/api/version', (_req, res) => {
    cancelShutdown();
    res.json({ version: getPackageVersion() });
});

app.post('/api/shutdown', (_req, res) => {
    res.json({ success: true });
    closeBrowseProcess();
    scheduleShutdown();
});

app.post('/api/cancel-shutdown', (_req, res) => {
    cancelShutdown();
    res.json({ success: true });
});

app.post('/api/build', async (req: express.Request, res: express.Response): Promise<void> => {
    cancelShutdown();
    const { inputPath, outputPath, minifyOpts } = req.body;
    
    console.log(`[Build] Input: ${inputPath}`);
    console.log(`[Build] Output: ${outputPath}`);

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
        // get stats
        const stats = await runMakeFsData(opts);

        try {
            await open(path.dirname(path.resolve(outputPath)));
        }
        catch (e) {
            // ignore open folder error
        }

        // return stats
        res.json({ 
            success: true, 
            stats: stats // originalSize, compressedSize, filesCount
        });
    }
    catch (error: any) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/change-port', (req: express.Request, res: express.Response): void => {
    cancelShutdown();
    const parsedPort = parseInt(req.body.newPort, 10);
    
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        res.json({ success: false, message: 'Invalid port number.' });
        return; 
    }

    res.json({ success: true });

    setTimeout(() => {
        if (server) {
            try {
                server.closeAllConnections(); 
                server.close(() => {
                    PORT = parsedPort;
                    startServer();
                    console.log(`🔄 Server successfully restarted on port ${PORT}`);
                });
            }
            catch (e) {
                startServer();
            }
        }
    }, 100);
});

app.get('/api/browse', async (req: express.Request, res: express.Response): Promise<void> => {
    cancelShutdown();

    res.on('close', () => {
        if (! res.writableEnded) {
            closeBrowseProcess();
            scheduleShutdown();
        }
    });

    const isDir = req.query.type === 'dir';
    const platform = os.platform();

    try {
        let result = '';

        if (platform === 'win32') {
            const script = isDir
                ? buildWindowsDialogScript([
                    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
                    '$dialog.Description = "Select Input Directory"',
                    'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
                    '    $dialog.SelectedPath',
                    '}'
                ])
                : buildWindowsDialogScript([
                    '$dialog = New-Object System.Windows.Forms.SaveFileDialog',
                    '$dialog.Filter = "C Files (*.c)|*.c|All Files (*.*)|*.*"',
                    '$dialog.DefaultExt = "c"',
                    '$dialog.AddExtension = $true',
                    '$dialog.OverwritePrompt = $true',
                    'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
                    '    $dialog.FileName',
                    '}'
                ]);

            result = await runDialogCommand('powershell.exe', buildPowerShellArgs(script));
        }
        else if (platform === 'darwin') {
            result = await runDialogCommand('osascript', [
                '-e',
                isDir
                    ? 'POSIX path of (choose folder with prompt "Select Input Directory")'
                    : 'POSIX path of (choose file name with prompt "Select Output File")'
            ]);
        }
        else {
            result = await runDialogCommand('zenity', isDir
                ? ['--file-selection', '--directory', '--title=Select Input Directory']
                : ['--file-selection', '--save', '--confirm-overwrite', '--title=Select Output File', '--filename=fsdata.c']
            );
        }

        res.json({ success: true, path: result || null });
    }
    catch (e) {
        res.json({ success: true, path: null });
    }
});

const startServer = () => {
    server = app.listen(PORT, () => {
        console.log(`✨ GUI Server started on http://localhost:${PORT}`);
    });
};

// main run
startServer();
open(`http://localhost:${PORT}`);