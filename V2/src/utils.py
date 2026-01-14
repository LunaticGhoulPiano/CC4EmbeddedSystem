import os
import re
import sys
import json
import subprocess
import shutil
import CC_Errs

config = {
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

def get_app_root() -> str:
    if hasattr(sys, "_MEIPASS"): # project root path for user
        return os.path.dirname(sys.executable)
    else: # project root path for developer
        return os.path.dirname(os.path.abspath(__file__))

def set_single_tool_path(tool: str,tool_path: str) -> None:
    config["tools"][tool] = tool_path

def save_user_configs(mode: str, content: dict[str, str]) -> None:
    config_path = os.path.join(get_app_root(), "config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding = "utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}
    else:
        data = {}
    
    if mode == "output_c_file":
        data["output_c_file"] = content["output_c_file"]
    else:
        if mode not in data:
            data[mode] = {}
        
        # check tools' parent folders
        if mode == "tools":
            # ensure all paths exist
            error_tools = []
            for tool, path in content.items():
                if not path or not os.path.exists(path):
                    error_tools.append(tool)
            if error_tools:
                raise CC_Errs.CC_Tool_Err(f"{', '.join(error_tools)} not found!", "Tool Path Not Chosen Error")

            # check corresponding tools are in the same folder
            is_same_c1 = True
            if os.path.dirname(content["htmlcompressor"]) != os.path.dirname(content["yuicompressor"]):
                is_same_c1 = False
            is_same_c2 = True
            if os.path.dirname(content["makefsdata"]) != os.path.dirname(content["msvcr100d"]):
                is_same_c2 = False
            if not is_same_c1 and not is_same_c2:
                raise CC_Errs.CC_Tool_Err("htmlcompressor*.jar and yuicompressor*.jar MUST be under the SAME folder; also, makefsdata and msvcr100d MUST be under the SAME folder.", "Tool Location Error")
            elif not is_same_c1:
                raise CC_Errs.CC_Tool_Err("htmlcompressor and yuicompressor MUST be under the SAME folder.", "Tool Location Error")
            elif not is_same_c2:
                raise CC_Errs.CC_Tool_Err("makefsdata.exe and msvcr100d.dll MUST be under the SAME folder.", "Tool Location Error")

        data[mode].update(content)

    with open(config_path, "w", encoding = "utf-8") as f:
        json.dump(data, f, indent = 4, ensure_ascii = False)

def get_user_configs() -> dict[str, str]:
    config_path = os.path.join(get_app_root(), "config.json")
    try:
        if not os.path.exists(config_path): # first time or path was deleted
            # create empty config
            with open(config_path, "w", encoding = "utf-8") as f:
                json.dump(config, f, indent = 4)
            return config
        else: # load to tool_paths
            with open(config_path, "r", encoding = "utf-8") as f:
                return json.load(f)
    except: # config format error, force to overwrite
        # create empty config
        with open(config_path, "w", encoding = "utf-8") as f:
            json.dump(config, f, indent = 4)
        return config

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

def validate_by_regex(path: str, pattern: str, tool_name: str) -> str:
    # check if tool exist
    if not path or not os.path.exists(path):
        print('not')
        raise CC_Errs.CC_Tool_Err(f"{tool_name} not found!", "Tool Not Found Error")
    # validate
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

def compress_files() -> None:
    # check env
    check_java()
    # get paths
    paths = get_user_configs()
    tool_paths = paths.get("tools", {})
    folder_paths = paths.get("folders", {})
    hp = validate_by_regex(tool_paths.get("htmlcompressor", ""), r"^htmlcompressor.*-\d+\.\d+\.\d+\.jar$", "htmlcompressor") # htmlcompressor*-x.y.z.jar
    _ = validate_by_regex(tool_paths.get("yuicompressor", ""), r"^yuicompressor.*-\d+\.\d+\.\d+\.jar$", "yuicompressor") # yuicompressor*-x.y.z.jar
    src = folder_paths.get("src", "")
    dest = folder_paths.get("compress_dest", "")
    if not src and not dest:
        raise CC_Errs.CC_Exec_Err("Source Folder Path and Destination Folder Path Has Not Been Set!")
    elif not src:
        raise CC_Errs.CC_Exec_Err("Source Folder Path Has Not Been Set!")
    elif not dest:
        raise CC_Errs.CC_Exec_Err("Destination Folder Path Has Not Been Set!")
    
    # run
    ## delete
    if os.path.exists(dest):
        shutil.rmtree(dest)
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
        raise CC_Errs.CC_Exec_Err(f"Failed to compress files: {str(e)}")
    
    # redirect: use Windows Explorer to open output folder
    os.startfile(dest)

def convert_files() -> None:
    paths = get_user_configs()
    tool_paths = paths.get("tools", {})
    src = paths.get("folders", {}).get("compress_dest", "") #paths["folders"]["compress_dest"]
    dest = paths.get("folders", {}).get("convert_dest", "")
    if not src and not dest:
        raise CC_Errs.CC_Exec_Err("Conversion Source Folder Path and Destination Folder Path Has Not Been Set!")
    elif not src:
        raise CC_Errs.CC_Exec_Err("Conversion Source Folder Path Has Not Been Set!")
    elif not dest:
        raise CC_Errs.CC_Exec_Err("Conversion Destination Folder Path Has Not Been Set!")
    dest = os.path.join(dest, paths["output_c_file"])
    ep = validate_by_regex(tool_paths.get("makefsdata", ""), r"^makefsdata\.exe$", "makefsdata")
    _ = validate_by_regex(tool_paths.get("msvcr100d", ""), r"^msvcr100d\.dll$", "MSVCR100D Library")

    # run
    cmd = [ep, src, f"-f:{dest}"]
    try:
        subprocess.run(cmd, check = True)
    except Exception as e:
        raise CC_Errs.CC_Exec_Err(f"Failed to convert files: {str(e)}")
    
    # redirect: use Windows Explorer to open output file path
    subprocess.run(["explorer", "/select,", os.path.normpath(dest)])