# CC4EmbeddedSystem V2
## Structure
```
<YOUR_DOWNLOAD_PATH>
├── CC4Embedded_<VERSION>.exe
└── config.json               // auto-generated
```

## Description
- Using python, uv and pyinstaller to re-write the whole project.
- Has a simple, intuitive gui (using custontkinter) to use.

## Screenshot
### v2.0.1
![](./Screenshot/v2.0.1.png)

## Config.json format
This config file is in order to record your paths and output file name.
```json
{
    "tools": {
        "htmlcompressor": "",
        "yuicompressor": "",
        "makefsdata": "",
        "msvcr100d": ""
    },
    "folders": {
        "src": "",
        "compress_dest": "",
        "convert_dest": ""
    },
    "output_c_file": "fsdata.c"
}
```

## Notices
1. Your ```htmlcompressor*.jar``` and ```yuicompressor*.jar``` **MUST be placed under the same folder**, and ```makefsdata.exe``` and ```msvcr100d.dll``` also **MUST be placed under the same folder**.
2. Two compressors' name MUST in the following format:
    - ```htmlcompressor-x.y.z.jar```
    - ```yuicompressor-x.y.z.jar```
    - ```x.y.z``` is your version.
3. The default output converted c file name is ```fsdata.c```.
4. You MUST click the ```Save Settings``` and ```Confirm Output File Name``` buttons, and choose the paths before ```Compress``` or ```Convert```.
5. After ```Compress``` and ```Convert```, this tool will automatically open the path of output folder (or file) in Windows File Explorer.