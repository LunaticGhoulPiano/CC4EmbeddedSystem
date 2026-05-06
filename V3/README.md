# CC4EmbeddedSystem V3
- This version based on [html-minifier-next](https://github.com/j9t/html-minifier-next) and rewrite [lwIP makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata), run on localhost, default port: ```3000```.
- This tool is deployed on [npm package](https://www.npmjs.com/package/cc4-embedded-system).

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
│   ├── gui.ts        // Express server & CLI entry point
│   │   └── utils.ts  // To get latest tool version
│   └── makefsdata.ts // Core C code generation & minification logic
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

# publish
npm whoami # verify
npm login
npm version patch --no-git-tag-version # if increase version
npm run dev # dev mode for testing
npm run build # build the newest
npm publish --access public
```