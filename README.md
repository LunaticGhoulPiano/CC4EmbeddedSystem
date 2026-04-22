# [CC4EmbeddedSystem](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem)

A modern, cross-platform tool to minify front-end web files (HTML/CSS/JS) and compile them into a single C array file (`fsdata.c`). 

It is designed specifically to optimize web servers running on resource-constrained embedded systems (like STM32) using the **lwIP TCP/IP stack**. By heavily compressing assets before flashing them into the MCU, it saves precious ROM/RAM space while keeping your web development workflow smooth.

---

## 🌟 The Evolution (V1 to V3)

This project has continuously evolved to drop heavy dependencies and embrace modern tech stacks:

* **[V3 (Current & Recommended)](./V3/README.md):** A pure **TypeScript / Node.js** implementation. It features a beautiful web-based GUI, utilizes the state-of-the-art `html-minifier-next`, and completely replaces the old `makefsdata.exe` with a safe, cross-platform TypeScript logic. **(Zero C/Java/DLL dependencies!)**
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
│   │   ├── gui.ts
│   │   ├── utils.ts
│   │   └── makefsdata.ts
│   ├── public
│   │   └── index.html
│   ├── Screenshot
│   │   └── v3.0.1.png
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
├── .gitignore
├── LICENSE
└── README.md
```