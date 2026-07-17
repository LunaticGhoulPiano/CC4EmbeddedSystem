export interface HtmlMinifyOptions {
    collapseWhitespace: boolean;
    removeComments: boolean;
    minifyJS: boolean;
    minifyCSS: boolean;
    processConditionalComments: boolean;
    decodeEntities: boolean;
    removeAttributeQuotes: boolean;
    removeEmptyAttributes: boolean;
    removeRedundantAttributes: boolean;
    useShortDoctype: boolean;
}

export const DEFAULT_HTML_MINIFY_OPTIONS: HtmlMinifyOptions = {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,
    minifyCSS: true,
    processConditionalComments: true,
    decodeEntities: true,
    removeAttributeQuotes: false,
    removeEmptyAttributes: false,
    removeRedundantAttributes: false,
    useShortDoctype: false
};

const HTML_MINIFY_OPTION_KEYS: readonly (keyof HtmlMinifyOptions)[] = [
    'collapseWhitespace',
    'removeComments',
    'minifyJS',
    'minifyCSS',
    'processConditionalComments',
    'decodeEntities',
    'removeAttributeQuotes',
    'removeEmptyAttributes',
    'removeRedundantAttributes',
    'useShortDoctype'
];

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const normalizeHtmlMinifyOptions = (value: unknown): HtmlMinifyOptions => {
    const normalized: HtmlMinifyOptions = { ...DEFAULT_HTML_MINIFY_OPTIONS };

    if (! isRecord(value)) return normalized;

    for (const key of HTML_MINIFY_OPTION_KEYS) {
        const optionValue = value[key];
        if (typeof optionValue === 'boolean') normalized[key] = optionValue;
    }

    return normalized;
};
