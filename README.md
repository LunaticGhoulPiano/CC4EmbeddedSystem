# [CC4EmbeddedSystem](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem)

A tool to optimize front-end web assets (HTML/CSS/JS/SVG) and convert them into a single C source file (`fsdata.c`) for embedded web servers.

It targets resource-constrained systems, such as STM32 devices using the **lwIP TCP/IP stack**. Assets are optimized and optionally compressed before being stored in Flash; the browser decompresses encoded responses.

---

## 🌟 The Evolution (V1 to V3)

This project has continuously evolved to drop heavy dependencies and embrace modern tech stacks:

* **[V3 (Recommended)](./V3/README.md):** A **TypeScript / Node.js** implementation with a local browser GUI and headless CLI. It optimizes HTML, CSS, JavaScript, and SVG, and supports uncompressed, gzip, Brotli, and gzip-compatible TypeScript Zopfli storage. Compressed bodies are retained only when smaller. Successful paths and compression settings are saved locally. The legacy `makefsdata.exe`, Java tools, and DLLs are not required.
* **[V2 (Legacy)](./V2/README.md):** A Python + CustomTkinter desktop application. It wraps the legacy Java compressors and C executables into a standalone Windows GUI.
* **[V1 (Legacy)](./V1/README.md):** The original Bare-metal PowerShell script workflow.

## 📦 Requirements

### For V3 (Recommended, Cross-platform)

* [Node.js](https://nodejs.org/) 22.13.0 or newer. Use the latest patched LTS for builds.
* The V3 tool uses Node.js instead of the legacy Windows executables and Java compressors.

### For V1 & V2 (Legacy Windows Environments)

If you must maintain the old workflows, you will need the following legacy assets:

* [Java JDK](https://www.oracle.com/java/technologies/downloads/) (Tested on JDK 25 x64)
* [Google HTML Compressor](https://code.google.com/archive/p/htmlcompressor/downloads) (`htmlcompressor-1.5.3.jar`)
* [YUI Compressor](https://github.com/yui/yuicompressor/releases/tag/v2.4.8) (`yuicompressor-2.4.8.jar`)
* [makefsdata.exe](https://github.com/m-labs/lwip/blob/master/src/apps/httpd/makefsdata/makefsdata.c) (Original lwIP C source)
* [MSVCR100D.DLL](https://www.dll-files.com/download/440e9fd9824b8e97d3ca2f34bd1bfbd1/msvcr100d.dll.html?c=NGVsZmJrdGtZUTNRVi9nQTBibWxEUT09) (32-bit, version 10.0.40219.325 required for the legacy `.exe`)

---

## 🚀 How to use

Install the V3 npm package and start the GUI:

```bash
npm install -g cc4-embedded-system
cc4es
```

The GUI defaults to `http://localhost:3000`. A fresh configuration selects **Brotli quality 11**; saved settings and explicit selections take precedence. Browsers generally require **HTTPS** for `Content-Encoding: br` (Brotli). Use gzip or Zopfli for HTTP-only device pages.

Version-specific quick starts and commands:

* 👉 **[V3 Quick Start, Development & Demos](./V3/README.md)**
* 👉 [V2 Documentation](./V2/README.md)
* 👉 [V1 Documentation](./V1/README.md)

The V3 source includes production frontend demos from DuetWebControl, ESP3D-WEBUI, and WLED. Their tests compare prepared source assets with raw C and decompressed C payloads. Target lwIP compilation, HTTP server integration, and real hardware behavior require separate verification.

---

## 📂 Project Structure

```text
CC4EmbeddedSystem
├── V1
│   ├── README.md
│   └── CC4EmbeddedSystem.ps1
├── V2
│   ├── README.md
│   ├── src
│   │   ├── main.py
│   │   ├── utils.py
│   │   └── CC_Errs.py
│   ├── Screenshot
│   │   ├── v2.0.1.png
│   │   └── v2.1.0.png
│   ├── .python-version
│   ├── pyproject.toml
│   └── uv.lock
├── V3
│   ├── README.md
│   ├── src
│   │   ├── gui.ts            // CLI entry point
│   │   ├── cli.ts            // Command-line parsing and help text
│   │   ├── server.ts         // Express GUI server
│   │   ├── config.ts         // Persistent paths and compression settings
│   │   ├── compression/      // Shared storage policy and gzip/Brotli/Zopfli codecs
│   │   ├── gzip-options.ts   // gzip defaults and compatibility options
│   │   ├── minify-options.ts // Shared HTML minifier options
│   │   ├── makefsdata.ts     // Asset optimization, storage, and C generation
│   │   └── utils.ts          // Package version lookup
│   ├── public
│   │   └── index.html
│   ├── Screenshot/           // GUI screenshots
│   ├── test
│   │   ├── cc4es.test.mjs    // Generator and CLI regression tests
│   │   └── compression.test.mjs // Codec, configuration, and GUI logic tests
│   ├── demo
│   │   ├── src/             // DuetWebControl, ESP3D-WEBUI, and WLED submodules
│   │   ├── dst/             // Raw and compressed C files, grouped by project
│   │   ├── projects.mjs     // Pinned revisions and output settings
│   │   ├── prepare.mjs      // Build upstream production assets
│   │   ├── build.mjs        // Generate C files
│   │   ├── fsdata.mjs       // Read C arrays and decode response bodies
│   │   ├── test.mjs         // Compare source/raw/decoded payloads
│   │   ├── mocks.mjs        // Limited simulated device APIs
│   │   └── serve.mjs        // Local HTTP/HTTPS demo server
│   ├── licenses/            // Third-party attribution
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
├── .gitignore
├── LICENSE
└── README.md
```
