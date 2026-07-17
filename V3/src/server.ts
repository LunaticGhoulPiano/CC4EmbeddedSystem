import express, { Request, Response } from 'express';
import { ChildProcess, execFile } from 'node:child_process';
import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { getLastBuildPaths, saveLastBuildPaths } from './config.js';
import { runMakeFsData, MakeFsDataOptions } from './makefsdata.js';
import { normalizeHtmlMinifyOptions } from './minify-options.js';
import { getPackageVersion } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildPowerShellArgs = (script: string): string[] => {
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

    return [
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        encodedCommand
    ];
};

const buildWindowsDialogScript = (dialogLines: readonly string[]): string => {
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

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

export const startGuiServer = (initialPort: number): void => {
    const app = express();
    let port = initialPort;
    let activeBrowseProcess: ChildProcess | null = null;
    let server: Server | null = null;
    let shutdownTimer: NodeJS.Timeout | null = null;

    const publicPath = fs.existsSync(path.join(__dirname, 'public'))
        ? path.join(__dirname, 'public')
        : path.join(__dirname, '../public');

    const closeBrowseProcess = (): void => {
        if (activeBrowseProcess && ! activeBrowseProcess.killed) {
            try {
                activeBrowseProcess.kill();
            }
            catch {
                // Ignore child cleanup errors.
            }
        }

        activeBrowseProcess = null;
    };

    const cancelShutdown = (): void => {
        if (! shutdownTimer) return;

        clearTimeout(shutdownTimer);
        shutdownTimer = null;
    };

    const scheduleShutdown = (): void => {
        if (shutdownTimer) return;

        shutdownTimer = setTimeout(() => {
            closeBrowseProcess();
            console.log('👋 Window closed, shutting down ...');
            process.exit(0);
        }, 2000);
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

    const startServer = (openBrowser: boolean): void => {
        server = app.listen(port, () => {
            const serverUrl = `http://localhost:${port}`;
            console.log(`✨ GUI Server started on ${serverUrl}`);

            if (openBrowser) void open(serverUrl).catch(() => undefined);
        });

        server.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${port} is already in use.`);
                process.exitCode = 1;
                return;
            }

            console.error(`❌ GUI server error: ${error.message}`);
            process.exitCode = 1;
        });
    };

    app.use(express.json());
    app.use(express.static(publicPath));

    app.get('/api/version', (_req, res) => {
        cancelShutdown();
        res.json({ version: getPackageVersion() });
    });

    app.get('/api/config', (_req, res) => {
        cancelShutdown();
        res.json({ lastBuild: getLastBuildPaths() ?? null });
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

    app.post('/api/build', async (req: Request, res: Response): Promise<void> => {
        cancelShutdown();
        const inputPath = isNonEmptyString(req.body.inputPath) ? req.body.inputPath.trim() : '';
        const outputPath = isNonEmptyString(req.body.outputPath) ? req.body.outputPath.trim() : '';

        if (! inputPath || ! outputPath) {
            res.status(400).json({ success: false, message: 'Input and output paths are required.' });
            return;
        }

        const opts: MakeFsDataOptions = {
            inputDir: path.resolve(inputPath),
            outputFile: path.resolve(outputPath),
            processSubs: true,
            includeHttpHeader: true,
            useHttp11: false,
            supportSsi: true,
            precalcChksum: false,
            minifyOpts: normalizeHtmlMinifyOptions(req.body.minifyOpts),
            optimizeSvg: true,
            svgoMultipass: false
        };

        console.log(`[Build] Input: ${opts.inputDir}`);
        console.log(`[Build] Output: ${opts.outputFile}`);

        try {
            const stats = await runMakeFsData(opts);
            saveLastBuildPaths(opts.inputDir, opts.outputFile);

            try {
                await open(path.dirname(opts.outputFile));
            }
            catch {
                // The generated result is still valid if the folder cannot be opened.
            }

            res.json({ success: true, stats });
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            res.json({ success: false, message });
        }
    });

    app.post('/api/change-port', (req: Request, res: Response): void => {
        cancelShutdown();
        const parsedPort = Number.parseInt(String(req.body.newPort), 10);

        if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
            res.status(400).json({ success: false, message: 'Invalid port number.' });
            return;
        }

        res.json({ success: true });

        setTimeout(() => {
            if (! server) {
                port = parsedPort;
                startServer(false);
                return;
            }

            try {
                server.closeAllConnections();
                server.close((error) => {
                    if (error) {
                        console.error(`❌ Could not restart GUI server: ${error.message}`);
                        return;
                    }

                    port = parsedPort;
                    startServer(false);
                    console.log(`🔄 GUI server restarted on port ${port}`);
                });
            }
            catch {
                port = parsedPort;
                startServer(false);
            }
        }, 100);
    });

    app.get('/api/browse', async (req: Request, res: Response): Promise<void> => {
        cancelShutdown();

        res.on('close', () => {
            if (! res.writableEnded) {
                closeBrowseProcess();
                scheduleShutdown();
            }
        });

        const isDirectory = req.query.type === 'dir';
        const platform = os.platform();

        try {
            let selectedPath = '';

            if (platform === 'win32') {
                const script = isDirectory
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

                selectedPath = await runDialogCommand('powershell.exe', buildPowerShellArgs(script));
            }
            else if (platform === 'darwin') {
                selectedPath = await runDialogCommand('osascript', [
                    '-e',
                    isDirectory
                        ? 'POSIX path of (choose folder with prompt "Select Input Directory")'
                        : 'POSIX path of (choose file name with prompt "Select Output File")'
                ]);
            }
            else {
                selectedPath = await runDialogCommand('zenity', isDirectory
                    ? ['--file-selection', '--directory', '--title=Select Input Directory']
                    : ['--file-selection', '--save', '--confirm-overwrite', '--title=Select Output File', '--filename=fsdata.c']
                );
            }

            res.json({ success: true, path: selectedPath || null });
        }
        catch {
            res.json({ success: true, path: null });
        }
    });

    console.log(`[System] Serving static files from: ${publicPath}`);
    startServer(true);
};
