# CC4EmbeddedSystem V1
## Structure
```
V1
├── htmlcompressor-1.5.3.jar            // should download by yourself and under the same folder with the script
├── yuicompressor-2.4.8.jar             // should download by yourself and under the same folder with the script
├── makefsdata.exe                      // should download by yourself and under the same folder with the script
├── msvcr100d.dll                       // should download by yourself and under the same folder with the script
├── <YOUR_PROJECT_1>
│   └── <YOUR_FILES_1>
├── <YOUR_PROJECT_1>_compressed         // auto-generated
│   └── <YOUR_FILES_AFTER_COMPRESSED_1>
├── <YOUR_PROJECT_2>
│   └── <YOUR_FILES_2>
├── <YOUR_PROJECT_2>_compressed         // auto-generated
│   └── <YOUR_FILES_AFTER_COMPRESSED_2>
├── fsdata_converted                    // auto-generated
│   ├── <YOUR_PROJECT1>.c
│   ├── <YOUR_PROJECT2>.c
│   └── ...
├── CC4EmbeddedSystem.ps1
└── README.md
```

## Description
- A powershell script running on terminal.
- All 4 assests **should be placed UNDER the SAME folder with the script**.
- The project source folder **should also be placed UNDER the SAME folder with the script**.

## Modes
1. Only compress files
    - "s" mode: compress a specific file at once
    - "a" mode: compress all files in the directory
2. Only convert (create) a single C file (fsdata)
3. Compress and convert the specific directory to a single C file

## Run in PowerShell command
```powershell
PS C:\YourPath\CC4EmbeddedSystem\V1> .\CC4EmbeddedSystem.ps1
```

## Demo
### S (Single) mode
```
PS C:\YourPath\CC4EmbeddedSystem\V1> .\CC4EmbeddedSystem.ps1

#################################################################
# [1] Compress files using Google HTML Compressor (.jar) - ONLY #
# [2] Convert to binary/c code using makefsdata (.exe) - ONLY   #
# [3] Compress files then convert to binary/c code - BOTH       #
#################################################################

Select an option: 3
Using Google Html Compressor: C:\YourPath\CC4EmbeddedSystem\V1\htmlcompressor-1.5.3.jar
Using YUI Compressor: C:\YourPath\CC4EmbeddedSystem\V1\yuicompressor-2.4.8.jar
Using Makefsdata: C:\YourPath\CC4EmbeddedSystem\V1\makefsdata.exe
Using DLL of Makefsdata: C:\YourPath\CC4EmbeddedSystem\V1\msvcr100d.dll

# Compression ###################################################

Enter source path: YOUR_PROJECT
Compress single file or all files in directory? (s/a): s
Enter file name under C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT: index.html
Compressed: C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT\index.html ===> C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed\index.html
Stop compressing? (y/n): n
Enter file name under C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT: popup.html
Compressed: C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT\popup.html ===> C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed\popup.html
Stop compressing? (y/n): y

# Conversion ####################################################


 makefsdata - HTML to C source converter
     by Jim Pettinato               - circa 2003
     extended by Simon Goldschmidt  - 2009

Writing to file "fsdata_converted\YOUR_PROJECT.c"
HTTP 1.0 header will be statically included.
  Processing all files in directory C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed and subdirectories...

processing /index.html...
processing /logo.png...
processing /popup.html...

Creating target file...


Processed 3 files - done.

Converted: C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed ===> fsdata_converted\YOUR_PROJECT.c
Press any key to exit:

PS C:\YourPath\CC4EmbeddedSystem\V1>
```
### A (All) mode
```
PS C:\YourPath\CC4EmbeddedSystem\V1> .\CC4EmbeddedSystem.ps1

#################################################################
# [1] Compress files using Google HTML Compressor (.jar) - ONLY #
# [2] Convert to binary/c code using makefsdata (.exe) - ONLY   #
# [3] Compress files then convert to binary/c code - BOTH       #
#################################################################

Select an option: 3
Using Google Html Compressor: C:\YourPath\CC4EmbeddedSystem\V1\htmlcompressor-1.5.3.jar
Using YUI Compressor: C:\YourPath\CC4EmbeddedSystem\V1\yuicompressor-2.4.8.jar
Using Makefsdata: C:\YourPath\CC4EmbeddedSystem\V1\makefsdata.exe
Using DLL of Makefsdata: C:\YourPath\CC4EmbeddedSystem\V1\msvcr100d.dll

# Compression ###################################################

Enter source path: YOUR_PROJECT
Compress single file or all files in directory? (s/a): a
Compressed: C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT ===> C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed

# Conversion ####################################################


 makefsdata - HTML to C source converter
     by Jim Pettinato               - circa 2003
     extended by Simon Goldschmidt  - 2009

Writing to file "fsdata_converted\YOUR_PROJECT.c"
HTTP 1.0 header will be statically included.
  Processing all files in directory C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed and subdirectories...

processing /index.html...
processing /logo.png...
processing /popup.html...

Creating target file...


Processed 3 files - done.

Converted: C:\YourPath\CC4EmbeddedSystem\V1\YOUR_PROJECT_compressed ===> fsdata_converted\YOUR_PROJECT.c
Press any key to exit:

PS C:\YourPath\CC4EmbeddedSystem\V1>
```