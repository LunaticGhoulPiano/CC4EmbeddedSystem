# CC4EmbeddedSystem V3
- This version is based on [html-minifier-next](https://github.com/j9t/html-minifier-next), [SVGO](https://github.com/svg/svgo), and a rewrite of [lwIP makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata). GUI mode runs on localhost, default port: ```3000```.
- This tool is deployed on [npm package](https://www.npmjs.com/package/cc4-embedded-system).
- The last successful source and destination paths are automatically saved as `cc4es_configs.json` in the operating system's local application-data directory. On Windows this is `%LOCALAPPDATA%\\cc4-embedded-system\\cc4es_configs.json`.
- The config file is created only after the first successful build, and its complete path is printed at that time. Use `cc4es --config-path` to print it later.

## Demo
- Select input directory

![](./Screenshot/inputs.png)
- Select output file path

![](./Screenshot/output.png)
- Result

![](./Screenshot/v3.1.10.png)

## Structure
```text
CC4EmbeddedSystem/
├── src/
│   ├── gui.ts            // CLI entry point
│   ├── cli.ts            // Command-line parsing and help text
│   ├── server.ts         // Express GUI server
│   ├── config.ts         // Persistent last-build paths
│   ├── minify-options.ts // Shared HTML minifier options
│   ├── makefsdata.ts     // Core C code generation and minification logic
│   └── utils.ts          // Package version lookup
├── public/
│   └── index.html    // Web GUI dashboard
├── Sereenshot/
│   ├── inputs.png    // Demo image
│   ├── output.png    // Demo image
│   └── v3.1.10.png   // Demo image
├── node_modules/     // Required submodules during development
├── dist/             // Compiled JavaScript output (Auto-generated)
├── package.json      // Project configuration & dependencies
├── package-lock.json // Project configuration & dependencies
└── tsconfig.json     // TypeScript configuration
```

## Commands
### CLI Help Texts
```text
Usage: cc4es [options]

Without options, starts the browser GUI.

  -h, --help                         Show this help and exit
  -V, --version                      Show version and exit
  --config-path                      Print the full config file path and exit
  --headless                         Build without server or browser
  -s, --src <directory>              Source directory (headless)
  -d, --dst <file|directory>         Output C file or directory (default: fsdata.c)
  -p, --port <1-65535>               GUI server port
  --[no-]optimize-svg                Enable or disable SVGO (default: enabled)
  --svgo-multipass                   Run SVGO optimization repeatedly

HTML compression options:
  --[no-]collapse-whitespace         --[no-]remove-comments
  --[no-]minify-js                   --[no-]minify-css
  --[no-]conditional-comments        --[no-]decode-entities
  --[no-]remove-attribute-quotes     --[no-]remove-empty-attributes
  --[no-]remove-redundant-attributes --[no-]use-short-doctype

Headless mode requires --src or --dst and never reruns the last build with
no path options. A missing counterpart uses the last saved path; if no
destination is saved, fsdata.c is created in the current working directory.
```
### Normal Use
- Global installation
    ```bash
    npm install -g cc4-embedded-system
    cc4es # run
    ```
- Run once (no installation)
    ```bash
    npx cc4-embedded-system
    ```
- Specific port set during initialization
    ```bash
    cc4es --port 3002
    ```
- Headless build (does not start a server or open a browser)
    ```bash
    cc4es --headless --src C:\Project\web --dst C:\Project\fsdata.c
    ```
- Headless build with the default output filename. An existing output directory uses `fsdata.c` inside it.
    ```bash
    cc4es --headless --src C:\Project\web
    cc4es --headless --src C:\Project\web --dst C:\Project\output
    ```
- Headless safety: a parameterless command stops instead of rerunning the last build
    ```bash
    cc4es --headless
    ```
- CLI help and version
    ```bash
    cc4es --help
    cc4es --version
    cc4es --config-path
    ```
- Compression flags can be supplied in headless mode. Every flag accepts a `--no-` form.
    ```bash
    cc4es --headless --no-minify-js --remove-attribute-quotes --svgo-multipass
    ```
- Update
  ```bash
  npm install -g cc4-embedded-system@latest
  ```
### Development
```bash
# build
npm run build

# mimic global installation
npm link
cc4es

# headless development test
npm run dev -- --headless --src C:\Project\web --dst C:\Project\fsdata.c

# publish
npm whoami # verify
npm login
npm version patch --no-git-tag-version # if increase version
npm run dev # dev mode for testing
npm run build # build the newest
npm publish --access public
```
