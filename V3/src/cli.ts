import { DEFAULT_HTML_MINIFY_OPTIONS, HtmlMinifyOptions } from './minify-options.js';

export class CliUsageError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'CliUsageError';
    }
}

export interface CliArguments {
    showHelp: boolean;
    showVersion: boolean;
    showConfigPath: boolean;
    headless: boolean;
    inputPath?: string;
    outputPath?: string;
    port?: number;
    minifyOpts: HtmlMinifyOptions;
    optimizeSvg: boolean;
    svgoMultipass: boolean;
}

const MINIFY_FLAGS: Readonly<Record<string, keyof HtmlMinifyOptions>> = {
    '--collapse-whitespace': 'collapseWhitespace',
    '--no-collapse-whitespace': 'collapseWhitespace',
    '--remove-comments': 'removeComments',
    '--no-remove-comments': 'removeComments',
    '--minify-js': 'minifyJS',
    '--no-minify-js': 'minifyJS',
    '--minify-css': 'minifyCSS',
    '--no-minify-css': 'minifyCSS',
    '--conditional-comments': 'processConditionalComments',
    '--no-conditional-comments': 'processConditionalComments',
    '--decode-entities': 'decodeEntities',
    '--no-decode-entities': 'decodeEntities',
    '--remove-attribute-quotes': 'removeAttributeQuotes',
    '--no-remove-attribute-quotes': 'removeAttributeQuotes',
    '--remove-empty-attributes': 'removeEmptyAttributes',
    '--no-remove-empty-attributes': 'removeEmptyAttributes',
    '--remove-redundant-attributes': 'removeRedundantAttributes',
    '--no-remove-redundant-attributes': 'removeRedundantAttributes',
    '--use-short-doctype': 'useShortDoctype',
    '--no-use-short-doctype': 'useShortDoctype'
};

const getRequiredValue = (args: readonly string[], index: number, option: string): string => {
    const value = args[index + 1];
    if (! value || value.startsWith('-')) throw new CliUsageError(`${option} requires a value.`);

    return value;
};

const parsePort = (value: string): number => {
    if (! /^\d+$/.test(value)) throw new CliUsageError('--port must be an integer from 1 to 65535.');

    const port = Number.parseInt(value, 10);
    if (port < 1 || port > 65535) throw new CliUsageError('--port must be an integer from 1 to 65535.');

    return port;
};

export const parseCliArguments = (args: readonly string[]): CliArguments => {
    const parsed: CliArguments = {
        showHelp: false,
        showVersion: false,
        showConfigPath: false,
        headless: false,
        minifyOpts: { ...DEFAULT_HTML_MINIFY_OPTIONS },
        optimizeSvg: true,
        svgoMultipass: false
    };

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (! argument) continue;

        const minifyOption = MINIFY_FLAGS[argument];
        if (minifyOption) {
            parsed.minifyOpts[minifyOption] = ! argument.startsWith('--no-');
            continue;
        }

        switch (argument) {
            case '-h':
            case '--help':
                parsed.showHelp = true;
                break;
            case '-V':
            case '--version':
                parsed.showVersion = true;
                break;
            case '--config-path':
                parsed.showConfigPath = true;
                break;
            case '--headless':
                parsed.headless = true;
                break;
            case '-s':
            case '--src':
            case '--input':
                parsed.inputPath = getRequiredValue(args, index, argument);
                index++;
                break;
            case '-d':
            case '--dst':
            case '--output':
                parsed.outputPath = getRequiredValue(args, index, argument);
                index++;
                break;
            case '-p':
            case '--port':
                parsed.port = parsePort(getRequiredValue(args, index, argument));
                index++;
                break;
            case '--optimize-svg':
                parsed.optimizeSvg = true;
                break;
            case '--no-optimize-svg':
                parsed.optimizeSvg = false;
                break;
            case '--svgo-multipass':
                parsed.svgoMultipass = true;
                break;
            default:
                throw new CliUsageError(`Unknown option: ${argument}`);
        }
    }

    if (parsed.headless && parsed.port !== undefined) {
        throw new CliUsageError('--port is only available when starting the GUI.');
    }

    if (parsed.headless && ! parsed.inputPath && ! parsed.outputPath) {
        throw new CliUsageError('Headless mode requires --src or --dst. It will not automatically rerun the last build.');
    }

    if (! parsed.headless && (parsed.inputPath || parsed.outputPath)) {
        throw new CliUsageError('--src and --dst require --headless.');
    }

    return parsed;
};

export const getHelpText = (): string => {
    return [
        'Usage: cc4es [options]',
        '',
        'Without options, starts the browser GUI.',
        '',
        '  -h, --help                         Show this help and exit',
        '  -V, --version                      Show version and exit',
        '  --config-path                      Print the full config file path and exit',
        '  --headless                         Build without server or browser',
        '  -s, --src <directory>              Source directory (headless)',
        '  -d, --dst <file|directory>         Output C file or directory (default: fsdata.c)',
        '  -p, --port <1-65535>               GUI server port',
        '  --[no-]optimize-svg                Enable or disable SVGO (default: enabled)',
        '  --svgo-multipass                   Run SVGO optimization repeatedly',
        '',
        'HTML compression options:',
        '  --[no-]collapse-whitespace         --[no-]remove-comments',
        '  --[no-]minify-js                   --[no-]minify-css',
        '  --[no-]conditional-comments        --[no-]decode-entities',
        '  --[no-]remove-attribute-quotes     --[no-]remove-empty-attributes',
        '  --[no-]remove-redundant-attributes --[no-]use-short-doctype',
        '',
        'Headless mode requires --src or --dst and never reruns the last build with',
        'no path options. A missing counterpart uses the last saved path; if no',
        'destination is saved, fsdata.c is created in the current working directory.'
    ].join('\n');
};
