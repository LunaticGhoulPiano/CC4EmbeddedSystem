# [CC4EmbeddedSystem](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem)

A modern, cross-platform tool to optimize front-end web files (HTML/CSS/JS/SVG) and compile them into a single C array file (`fsdata.c`). 

It is designed specifically to optimize web servers running on resource-constrained embedded systems (like STM32) using the **lwIP TCP/IP stack**. By heavily compressing assets before flashing them into the MCU, it saves precious ROM/RAM space while keeping your web development workflow smooth.

---

## 🌟 The Evolution (V1 to V3)

This project has continuously evolved to drop heavy dependencies and embrace modern tech stacks:

* **[V3 (Current & Recommended, v3.2.1)](./V3/README.md):** A pure **TypeScript / Node.js** implementation with browser GUI and headless CLI modes. It routes HTML to `html-minifier-next`, CSS to Lightning CSS, JavaScript to esbuild, and SVG to SVGO before generating lwIP `fsdata.c`. Optional deterministic gzip storage adds `Content-Encoding: gzip` only when an eligible text asset becomes smaller. It remembers the last successful paths and gzip options in local application data, and replaces `makefsdata.exe` with safe, cross-platform TypeScript logic. **(Zero C/Java/DLL dependencies!)**
* **[V2 (Legacy)](./V2/README.md):** A Python + CustomTkinter desktop application. It wraps the legacy Java compressors and C executables into a standalone Windows GUI.
* **[V1 (Legacy)](./V1/README.md):** The original Bare-metal PowerShell script workflow.

## 📦 Requirements

### For V3 (Recommended, Cross-platform)
* [Node.js](https://nodejs.org/) (v18 or newer recommended)
* That's it! Works on Windows, macOS, and Linux.

### For V1 & V2 (Legacy Windows Environments)
If you must maintain the old workflows, you will need the following legacy assets:
* [Java JDK](https://www.oracle.com/java/technologies/downloads/) (Tested on JDK 25 x64)
* [Google HTML Compressor](https://code.google.com/archive/p/htmlcompressor/downloads) (`htmlcompressor-1.5.3.jar`)
* [YUI Compressor](https://github.com/yui/yuicompressor/releases/tag/v2.4.8) (`yuicompressor-2.4.8.jar`)
* [makefsdata.exe](https://github.com/m-labs/lwip/blob/master/src/apps/httpd/makefsdata/makefsdata.c) (Original lwIP C source)
* [MSVCR100D.DLL](https://www.dll-files.com/download/440e9fd9824b8e97d3ca2f34bd1bfbd1/msvcr100d.dll.html?c=NGVsZmJrdGtZUTNRVi9nQTBibWxEUT09) (32-bit, version 10.0.40219.325 required for the legacy `.exe`)

---

## 🚀 How to use

Depending on which version you want to use, please navigate to the respective directory and read its dedicated documentation:

* 👉 **[V3 Documentation](./V3/README.md)** (Highly Recommended)
* 👉 [V2 Documentation](./V2/README.md)
* 👉 [V1 Documentation](./V1/README.md)

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
│   │   ├── config.ts         // Persistent paths and gzip options
│   │   ├── gzip-options.ts   // Shared gzip defaults and validation
│   │   ├── minify-options.ts // Shared HTML minifier options
│   │   ├── makefsdata.ts     // Asset routing, gzip, and C generation
│   │   └── utils.ts          // Package version lookup
│   ├── public
│   │   └── index.html
│   ├── Screenshot
│   │   ├── cli.png
│   │   ├── src.png
│   │   ├── dst.png
│   │   ├── v3.2.0_result1.png
│   │   └── v3.2.0_result2.png
│   ├── test
│   │   └── cc4es.test.mjs    // Native Node.js regression tests
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
├── .gitignore
├── LICENSE
└── README.md
```
