import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_FILE_NAME = 'cc4es_configs.json';

export interface LastBuildPaths {
    src: string;
    dst: string;
}

interface AppConfig {
    schemaVersion: number;
    lastBuild?: LastBuildPaths;
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

const readConfig = (): AppConfig => {
    try {
        const parsedConfig: unknown = JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
        if (! isRecord(parsedConfig) || ! isRecord(parsedConfig.lastBuild)) return { schemaVersion: 1 };

        const src = parsedConfig.lastBuild.src;
        const dst = parsedConfig.lastBuild.dst;

        if (typeof src !== 'string' || typeof dst !== 'string' || ! src || ! dst) {
            return { schemaVersion: 1 };
        }

        return {
            schemaVersion: 1,
            lastBuild: { src, dst }
        };
    }
    catch {
        return { schemaVersion: 1 };
    }
};

export const getLastBuildPaths = (): LastBuildPaths | undefined => {
    return readConfig().lastBuild;
};

export const saveLastBuildPaths = (src: string, dst: string): boolean => {
    const configFilePath = getConfigFilePath();
    const temporaryFilePath = `${configFilePath}.${process.pid}.tmp`;
    const configAlreadyExists = fs.existsSync(configFilePath);
    const config: AppConfig = {
        schemaVersion: 1,
        lastBuild: { src, dst }
    };

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
