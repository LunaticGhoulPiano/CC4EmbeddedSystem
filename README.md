# CC4EmbeddedSystem
## Description
A tiny tool for Windows to compress front-end files and convert them into a single C file, in order to minimize memory usage while also being convenient for embedded system development.

## Usage
- Compress HTML/XML/CSS/JS/... files using [Google htmlcompressor](https://code.google.com/archive/p/htmlcompressor/)
- Convert (create) the given directory to a single C file (fsdata)

## How to use
Please read the document first:
### [V1 README](./V1/README.md)
### [V2 README](./V2/README.md)

## Project Structure
```
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
│   ├── .python-version
│   ├── pyproject.toml
│   └── uv.lock
├── .gitignore
├── LICENSE
└── README.md
```

## Requirements
### Environment Installation:
- [Java JDK](https://www.oracle.com/java/technologies/downloads/)
### Download Assets:
- [Google HTML Compressor](https://code.google.com/archive/p/htmlcompressor/)
- [YUI Compressor](https://github.com/yui/yuicompressor/releases/tag/v2.4.8)
- [makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata)
- [MSVCR100D.DLL](https://www.dll-files.com/msvcr100d.dll.html)
### My environment:
- [Java JDK 25 x64 bit](https://download.oracle.com/java/25/latest/jdk-25_windows-x64_bin.msi)
- [htmlcompressor-1.5.3.jar](https://code.google.com/archive/p/htmlcompressor/downloads)
    - Note: **You can have multiple version, the script will choose the latest one**
- [yuicompressor-2.4.8.jar](https://github.com/yui/yuicompressor/releases/tag/v2.4.8)
    - Note: **You can have multiple version, the script will choose the latest one**
- [msvcr100d.dll version 10.0.40219.325 32 bit](https://www.dll-files.com/download/440e9fd9824b8e97d3ca2f34bd1bfbd1/msvcr100d.dll.html?c=NGVsZmJrdGtZUTNRVi9nQTBibWxEUT09)
- makefsdata.exe was given by my colleague, but you can compile [the source code](https://github.com/m-labs/lwip/blob/master/src/apps/httpd/makefsdata/makefsdata.c) on your own

## Just a notes for me
### Command for packing using ```pyinstaller``` with ```uv``` under the current project (V2) structure:
```pwsh
PS C:\...\CC4EmbeddedSystem\V2> uv run pyinstaller --noconfirm --onefile --windowed --clean --name "CC4Embedded_V2.0.0" --collect-all "customtkinter" --paths "src" src/main.py
```