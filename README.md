# CC4EmbeddedSystem
## Description
A simple PowerShell script for Windows to compress front-end files and convert them into a single C file, in order to minimize memory usage while also being convenient for embedded system development.

## Usage
- Compress HTML/XML/CSS/JS/... files using [Google htmlcompressor](https://code.google.com/archive/p/htmlcompressor/)
- Convert (create) the given directory to a single C file (fsdata)
- Three modes:
    1. Only compress files
        - "s" mode: compress a specific file at once
        - "a" mode: compress all files in the directory
    2. Only convert (create) a single C file (fsdata)
    3. Compress and convert the specific directory to a single C file

## Structure
```
CC4EmbeddedSystem
├── CC4EmbeddedSystem.ps1
├── htmlcompressor-1.5.3.jar
├── yuicompressor-2.4.8.jar
├── makefsdata.exe
├── msvcr100d.dll
├── <Source Directory 1>
├── <Source Directory 2>
├── ...
├── <Source Directory 1>_compressed // auto-generated
├── <Source Directory 2>_compressed // auto-generated
├── ...                             // auto-generated
├── fsdata_converted                // auto-generated
│   ├──<Source Directory 1>.c       // auto-generated
│   ├──<Source Directory 2>.c       // auto-generated
│   ├── ...                         // auto-generated
└── README.md
```

## Requirements
- [Java JDK](https://www.oracle.com/java/technologies/downloads/)
- [Google HTML Compressor](https://code.google.com/archive/p/htmlcompressor/)
- [YUI Compressor](https://github.com/yui/yuicompressor/releases/tag/v2.4.8)
- [makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata)
- [MSVCR100D.DLL](https://www.dll-files.com/msvcr100d.dll.html)
- My version:
    - [Java JDK 25 x64 bit](https://download.oracle.com/java/25/latest/jdk-25_windows-x64_bin.msi)
    - [htmlcompressor-1.5.3.jar](https://code.google.com/archive/p/htmlcompressor/downloads)
        - Note: **You can have multiple version, the script will choose the latest one**
    - [yuicompressor-2.4.8.jar](https://github.com/yui/yuicompressor/releases/tag/v2.4.8)
        - Note: **You can have multiple version, the script will choose the latest one**
    - [msvcr100d.dll version 10.0.40219.325 32 bit](https://www.dll-files.com/download/440e9fd9824b8e97d3ca2f34bd1bfbd1/msvcr100d.dll.html?c=NGVsZmJrdGtZUTNRVi9nQTBibWxEUT09)
    - makefsdata.exe was given by my colleague

## Run in PowerShell command
```powershell
PS C:\YourPath> .\CompressAndConvert.ps1
```

## Demo
```
PS C:\Users\USER\Documents\STM32_Projects_HTML> .\CompressAndConvert.ps1

#################################################################
# [1] Compress files using Google HTML Compressor (.jar) - ONLY #
# [2] Convert to binary/c code using makefsdata (.exe) - ONLY   #
# [3] Compress files then convert to binary/c code - BOTH       #
#################################################################

Select an option: 3   
Using Google Html Compressor: C:\Users\USER\Documents\STM32_Projects_HTML\htmlcompressor-1.5.3.jar
Using YUI Compressor: C:\Users\USER\Documents\STM32_Projects_HTML\yuicompressor-2.4.8.jar
Using Makefsdata: C:\Users\USER\Documents\STM32_Projects_HTML\makefsdata.exe
Using DLL of Makefsdata: C:\Users\USER\Documents\STM32_Projects_HTML\msvcr100d.dll

# Compression ###################################################

Enter source path: test
Compress single file or all files in directory? (s/a): a
Compressed: C:\Users\USER\Documents\STM32_Projects_HTML\test => C:\Users\USER\Documents\STM32_Projects_HTML\test_compressed

# Conversion ####################################################


 makefsdata - HTML to C source converter
     by Jim Pettinato               - circa 2003
     extended by Simon Goldschmidt  - 2009

Writing to file "fsdata_converted\test.c"
HTTP 1.0 header will be statically included.
  Processing all files in directory C:\Users\USER\Documents\STM32_Projects_HTML\test_compressed and subdirectories...

processing /index.html...
processing /index_06.png...
processing /index_11.png...
processing /logo.png...
processing /qut.html...
processing /r2cal.html...
processing /redirhome.html...

Creating target file...


Processed 7 files - done.

Converted: C:\Users\USER\Documents\STM32_Projects_HTML\test_compressed => fsdata_converted\test.c
Press any key to exit:

PS C:\Users\USER\Documents\STM32_Projects_HTML> ls

    Directory: C:\Users\USER\Documents\STM32_Projects_HTML

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d----          2026/1/8 下午 06:08                fsdata_converted
d----          2026/1/8 下午 06:07                test
d----          2026/1/8 下午 06:08                test_compressed
-a---          2026/1/8 下午 06:10           6679 CompressAndConvert.ps1
-a---         2025/7/28 下午 03:36          68685 htmlcompressor-1.5.3.jar
-a---         2018/5/19 下午 06:50          46592 makefsdata.exe
-a---          2026/1/8 下午 04:18        1505104 msvcr100d.dll
-a---          2026/1/8 下午 06:13           4259 README.md
-a---          2026/1/8 上午 10:56         787524 yuicompressor-2.4.8.jar
```