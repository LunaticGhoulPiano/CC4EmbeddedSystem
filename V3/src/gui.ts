#!/usr/bin/env node

import path from 'node:path';
import { CliUsageError, getHelpText, parseCliArguments } from './cli.js';
import { getConfigFilePath, getLastBuildPaths, saveLastBuildPaths } from './config.js';
import { runMakeFsData, MakeFsDataOptions } from './makefsdata.js';
import { HtmlMinifyOptions } from './minify-options.js';
import { startGuiServer } from './server.js';
import { getPackageVersion } from './utils.js';

const getDefaultGuiPort = (): number => {
    const configuredPort = Number.parseInt(process.env.PORT ?? '3000', 10);

    if (configuredPort < 1 || configuredPort > 65535 || Number.isNaN(configuredPort)) return 3000;

    return configuredPort;
};

const runHeadlessBuild = async (inputPath: string | undefined, outputPath: string | undefined, minifyOpts: HtmlMinifyOptions, optimizeSvg: boolean, svgoMultipass: boolean): Promise<void> => {
    const lastBuild = getLastBuildPaths();
    const selectedInputPath = inputPath ?? lastBuild?.src;
    const selectedOutputPath = outputPath ?? lastBuild?.dst ?? 'fsdata.c';

    if (! selectedInputPath) {
        throw new CliUsageError('Headless mode requires --src, or a source path saved by a previous successful build.');
    }

    const opts: MakeFsDataOptions = {
        inputDir: path.resolve(selectedInputPath),
        outputFile: path.resolve(selectedOutputPath),
        processSubs: true,
        includeHttpHeader: true,
        useHttp11: false,
        supportSsi: true,
        precalcChksum: false,
        minifyOpts,
        optimizeSvg,
        svgoMultipass
    };

    const stats = await runMakeFsData(opts);
    saveLastBuildPaths(opts.inputDir, opts.outputFile);
    console.log(`✨ Build complete: ${stats.filesCount} file(s), ${stats.originalSize} -> ${stats.compressedSize} bytes.`);
};

const main = async (): Promise<void> => {
    try {
        const args = parseCliArguments(process.argv.slice(2));

        if (args.showHelp) {
            console.log(getHelpText());
            return;
        }

        if (args.showVersion) {
            console.log(getPackageVersion());
            return;
        }

        if (args.showConfigPath) {
            console.log(getConfigFilePath());
            return;
        }

        if (args.headless) {
            await runHeadlessBuild(args.inputPath, args.outputPath, args.minifyOpts, args.optimizeSvg, args.svgoMultipass);
            return;
        }

        startGuiServer(args.port ?? getDefaultGuiPort());
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ ${message}`);
        process.exitCode = 1;
    }
};

void main();
