import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GzipBuildOptions, isGzipLevel } from './gzip-options.js';

export const CONFIG_FILE_NAME = 'cc4es_configs.json';

export interface LastBuildPaths {
    src: string;
    dst: string;
}

interface AppConfig {
    schemaVersion: number;
    lastBuild?: LastBuildPaths;
    gzipOptions?: GzipBuildOptions;
}

const getStateDirectory = (): string => {
    const homeDirectory = os.homedir();

    if (process.platform === 'win32') {
        return process.env.LOCALAPPDATA ?? path.join(homeDirectory, 'AppData', 'Local');
    }

    if (process.platform === 'darwin') {
        return path.join(homeDirectory, 'Library', 'Application Support');
    }

    return process.env.XDG_STATE_HOME ?? path.join(homeDirectory, '.local', 'state');
};

export const getConfigFilePath = (): string => {
    return path.join(getStateDirectory(), 'cc4-embedded-system', CONFIG_FILE_NAME);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const getGzipOptions = (value: unknown): GzipBuildOptions | undefined => {
    if (! isRecord(value)) return undefined;

    const gzip = value.gzip;
    const gzipLevel = value.gzipLevel;
    if (typeof gzip !== 'boolean' || ! isGzipLevel(gzipLevel)) return undefined;

    return { gzip, gzipLevel };
};

const readConfig = (): AppConfig => {
    try {
        const parsedConfig: unknown = JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
        if (! isRecord(parsedConfig)) return { schemaVersion: 2 };

        const config: AppConfig = { schemaVersion: 2 };
        const gzipOptions = getGzipOptions(parsedConfig.gzipOptions);
        if (gzipOptions) config.gzipOptions = gzipOptions;

        if (! isRecord(parsedConfig.lastBuild)) return config;

        const src = parsedConfig.lastBuild.src;
        const dst = parsedConfig.lastBuild.dst;

        if (typeof src !== 'string' || typeof dst !== 'string' || ! src || ! dst) {
            return config;
        }

        config.lastBuild = { src, dst };
        return config;
    }
    catch {
        return { schemaVersion: 2 };
    }
};

export const getLastBuildPaths = (): LastBuildPaths | undefined => {
    return readConfig().lastBuild;
};

export const getLastGzipOptions = (): GzipBuildOptions | undefined => {
    return readConfig().gzipOptions;
};

export const saveLastBuildPaths = (src: string, dst: string, gzipOptions?: GzipBuildOptions): boolean => {
    const configFilePath = getConfigFilePath();
    const temporaryFilePath = `${configFilePath}.${process.pid}.tmp`;
    const configAlreadyExists = fs.existsSync(configFilePath);
    const config: AppConfig = {
        schemaVersion: 2,
        lastBuild: { src, dst }
    };
    if (gzipOptions) config.gzipOptions = gzipOptions;

    try {
        fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
        fs.writeFileSync(temporaryFilePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaryFilePath, configFilePath);

        if (! configAlreadyExists) console.log(`📝 Created config: ${configFilePath}`);

        return true;
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Could not save ${CONFIG_FILE_NAME}: ${message}`);

        try {
            if (fs.existsSync(temporaryFilePath)) fs.unlinkSync(temporaryFilePath);
        }
        catch {
            // Ignore cleanup errors because the build itself succeeded.
        }

        return false;
    }
};
