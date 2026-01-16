import os
import re
import sys
import json
import copy
import time
import subprocess
import shutil
import CC_Errs

def get_app_root() -> str:
    if hasattr(sys, "_MEIPASS"): # project root path for user
        return os.path.dirname(sys.executable)
    else: # project root path for developer
        return os.path.dirname(os.path.abspath(__file__))

ASSETS_DIR = os.path.join(get_app_root(), "assets")
CONFIG_TEMPLATE = {
    "tools": {
        "htmlcompressor": os.path.join(ASSETS_DIR, "htmlcompressor-1.5.3.jar"),
        "yuicompressor": os.path.join(ASSETS_DIR, "yuicompressor-2.4.8.jar"),
        "makefsdata": os.path.join(ASSETS_DIR, "makefsdata.exe"),
        "msvcr100d": os.path.join(ASSETS_DIR, "msvcr100d.dll")
    },
    "folders": {
        "src": "",
        "dest": ""
    },
    "output_c_file": "fsdata.c"
}

def save_user_configs(key: str, content: dict[str, str]) -> None:
    config_path = os.path.join(get_app_root(), "config.json")
    data = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding = "utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}

    if key == "output_c_file":
        data["output_c_file"] = content["output_c_file"]
    else:
        if key not in data:
            data[key] = {}
        data[key].update(content)

    with open(config_path, "w", encoding = "utf-8") as f:
        json.dump(data, f, indent = 4, ensure_ascii = False)

def get_user_configs() -> dict[str, str]:
    config_path = os.path.join(get_app_root(), "config.json")
    def get_empty_config() -> dict[str, str]:
        c = copy.deepcopy(CONFIG_TEMPLATE)
        with open(config_path, "w", encoding = "utf-8") as f:
            json.dump(c, f, indent = 4)
        return c
    try:
        if not os.path.exists(config_path):
            return get_empty_config()
        else: # load to tool_paths
            with open(config_path, "r", encoding = "utf-8") as f:
                return json.load(f)
    except:
        return get_empty_config()

def check_java() -> None:
    if shutil.which("java") is None:
        raise CC_Errs.CC_Java_Err("Can\'t find java executable, please install java (jdk is recommended) and restart the application.")

    try:
        result = subprocess.run(
            ["java", "-version"],
            stdout = subprocess.PIPE,
            stderr = subprocess.STDOUT, # java design to send version info as stderr, so merge stdout and stderr together
            text = True,
            check = True
        )
        if result.returncode != 0:
            raise CC_Errs.CC_Java_Err("Failed to get java version. Please restart or reinstall java (jdk is recommended).")
    except Exception as e:
        raise CC_Errs.CC_Java_Err(f"Error occurred while running java: {str(e)}")

def validate_tool(path: str, pattern: str, tool_name: str) -> str:
    # check if tool exist
    if not path or not os.path.exists(path):
        raise CC_Errs.CC_Tool_Err(f"{tool_name} not found!", "Tool Not Found Error")
    # validate file name format
    filename = os.path.basename(path)
    if not re.match(pattern, filename, re.IGNORECASE):
        if "makefsdata" in tool_name.lower():
            expected = "makefsdata.exe"
            raise CC_Errs.CC_Tool_Err(f"Detected: {filename}\nExpected: {expected}", "Converter EXE Name Format Error")
        elif "msvcr100d" in tool_name.lower():
            expected = "msvcr100d.dll"
            raise CC_Errs.CC_Tool_Err(f"Detected: {filename}\nExpected: {expected}", "Converter DLL Name Format Error")
        else: # compression tools
            expected = "htmlcompressor-x.y.z.jar" if "html" in tool_name.lower() else "yuicompressor-x.y.z.jar"
            raise CC_Errs.CC_Tool_Err(f"Detected: {filename}\nExpected: {expected}", "Compressor Name Format Error")
    return path

def check_is_same_parent_folder(tools: list[str]) -> None:
    parent = ""
    for tool in tools:
        if not parent:
            parent = os.path.dirname(tool)
        else:
            if parent != os.path.dirname(tool):
                tools_str = ", ".join(tools)
                raise CC_Errs.CC_Tool_Err(f"{tools_str} should be in the same folder!", "Tool Not In Same Folder Error")

def compress_then_convert() -> None:
    # check env
    check_java()

    # get and check tool paths
    paths = get_user_configs()
    tool_paths = paths.get("tools", {})
    folder_paths = paths.get("folders", {})
    hp = validate_tool(tool_paths.get("htmlcompressor", ""), r"^htmlcompressor.*-\d+\.\d+\.\d+\.jar$", "htmlcompressor") # htmlcompressor*-x.y.z.jar
    yp = validate_tool(tool_paths.get("yuicompressor", ""), r"^yuicompressor.*-\d+\.\d+\.\d+\.jar$", "yuicompressor") # yuicompressor*-x.y.z.jar
    check_is_same_parent_folder([hp, yp]) # validate if tool parent paths are the same

    # get src path
    src = folder_paths.get("src", "")
    if not src:
        raise CC_Errs.CC_Exec_Err("Source Folder Path Has Not Been Set!")
    
    # set temp compress dest path: src + _yyyyMMddHHmmss
    dest = os.path.join(os.path.dirname(src), f"{os.path.basename(src)}_{time.strftime('%Y%m%d%H%M%S', time.localtime())}")
    
    # run
    ## copy
    shutil.copytree(src, dest)
    ## run in subprocess
    cmd = [
        "java", "-jar", hp,
        "-o", f"{dest}/", # output + /
        "--compress-js",
        "--compress-css",
        f"{dest}/" # input + /
    ]
    try:
        subprocess.run(cmd, check = True)
    except Exception as e:
        shutil.rmtree(dest)
        raise CC_Errs.CC_Exec_Err(f"Failed to compress files: {str(e)}")
    
    # convert
    convert_files(dest)

def convert_files(compress_src: str = None) -> None:
    paths = get_user_configs()
    # get and check tool paths
    tool_paths = paths.get("tools", {})
    ep = validate_tool(tool_paths.get("makefsdata", ""), r"^makefsdata\.exe$", "makefsdata")
    dp = validate_tool(tool_paths.get("msvcr100d", ""), r"^msvcr100d\.dll$", "MSVCR100D Library")
    check_is_same_parent_folder([ep, dp]) # validate if tool parent paths are the same
    # get src/dest paths
    src = compress_src if compress_src else paths.get("folders", {}).get("src", "")
    if not src:
        raise CC_Errs.CC_Exec_Err("Conversion Source Folder Path Has Not Been Set!")
    dest = paths.get("folders", {}).get("dest", "")
    if not dest:
        raise CC_Errs.CC_Exec_Err("Conversion Destination Folder Path Has Not Been Set!")
    dest = os.path.join(dest, paths["output_c_file"])

    # run
    cmd = [ep, src, f"-f:{dest}"]
    try:
        subprocess.run(cmd, check = True)
    except Exception as e:
        raise CC_Errs.CC_Exec_Err(f"Failed to convert files: {str(e)}")
    finally:
        if compress_src and os.path.exists(compress_src):
            time.sleep(0.5) # to avoid subprocess is using
            shutil.rmtree(compress_src, ignore_errors = True)
    
    # redirect: use Windows Explorer to open output file path
    subprocess.run(["explorer", "/select,", os.path.normpath(dest)])