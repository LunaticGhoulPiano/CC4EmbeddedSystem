import os
import customtkinter as ctk
from tkinter import filedialog, messagebox
import utils
import CC_Errs

class Path_Chooser(ctk.CTkFrame):
    def __init__(self, frame, placeholder: str, btn_title: str, mode: str = "dir", on_change = None, **kwargs):
        super().__init__(frame, corner_radius = 0, **kwargs)
        self.mode = mode # choose directory or file
        self.on_change = on_change
        
        # percentage configuration
        self.grid_columnconfigure(0, weight = 8, uniform = "inner")
        self.grid_columnconfigure(1, weight = 7, uniform = "inner")
        self.grid_rowconfigure(0, weight = 1)
        
        # path entry
        self.entry = ctk.CTkEntry(self, placeholder_text = placeholder, height = 28)
        self.entry.grid(row = 0, column = 0, sticky = "ew", padx = (10, 5), pady = 5)
        
        # browse button
        self.button = ctk.CTkButton(self, text = f"Browse {btn_title} ..." if btn_title else "Browse ...", width = 10, height = 28, command = self.browse_action)
        self.button.grid(row = 0, column = 1, sticky = "ew", padx = (5, 10), pady = 5)
    
    def browse_action(self):
        cur_path = self.entry.get()
        init_dir = os.path.dirname(cur_path) if os.path.exists(cur_path) else None
        if self.mode == "dir":
            path = filedialog.askdirectory(initialdir = init_dir)
        else:
            path = filedialog.askopenfilename(initialdir = init_dir)
            
        if path:
            self.entry.delete(0, "end")
            self.entry.insert(0, path)
            if self.on_change:
                self.on_change()

class Filename_Input(ctk.CTkFrame):
    def __init__(self, frame, placeholder: str, on_confirm = None, **kwargs):
        super().__init__(frame, corner_radius = 0, **kwargs)
        self.on_confirm = on_confirm
        
        # percentage configuration
        self.grid_columnconfigure(0, weight = 6, uniform = "inner")
        self.grid_columnconfigure(1, weight = 4, uniform = "inner")
        self.grid_rowconfigure(0, weight = 1)
        
        # input entry
        self.entry = ctk.CTkEntry(self, placeholder_text = placeholder, height = 28)
        self.entry.grid(row = 0, column = 0, sticky = "ew", padx = (10, 5), pady = 5)
        
        # confirm button
        self.button = ctk.CTkButton(self, text = "Confirm Output File Name", width = 10, height = 28, command = self.confirm_action, fg_color = "#2c6e49")
        self.button.grid(row= 0 , column = 1, sticky = "ew", padx = (5, 10), pady = 5)

    def confirm_action(self):
        filename = self.entry.get().strip().replace(" ", "_")
        if not filename:
            filename = "fsdata.c"
            self.entry.delete(0, "end")
            self.entry.insert(0, filename)
        elif not filename.lower().endswith(".c"):
            filename += ".c"
            self.entry.delete(0, "end")
            self.entry.insert(0, filename)

        # callback
        if self.on_confirm:
            self.on_confirm(self.entry.get())

class CTK_Window(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("CC4EmbeddedSystem v2.1.0")
        self.window_width = 800
        self.window_height = 150
        self.center_window(self.window_height, self.window_width)
        self.attributes("-topmost", True)
        self.resizable(False, False)

        # load paths
        self.path_settings = utils.get_user_configs()
        
        # UI
        self.ui = {
            "io": {
                "frame": None,
                "label": None,
                "path_choosers": {},
                "filename_input": {}
            },
            "exec": {
                "frame": None,
                "label": None,
                "compress_then_convert": {
                    "frame": None,
                    "button": None
                },
                "convert": {
                    "frame": None,
                    "button": None
                },
            }
        }
        self.init_ui()

    def init_ui(self):
        # percentage configuration
        left_col = 0
        right_col = 1
        self.grid_columnconfigure(left_col, weight = 3) # left frame
        self.grid_columnconfigure(right_col, weight = 1) # right frame
        self.grid_rowconfigure(0, weight = 1)

        ## left frame: io
        self.ui["io"]["frame"] = ctk.CTkFrame(self, fg_color = "transparent")
        self.ui["io"]["frame"].grid(row = 0, column = left_col, sticky  = "nsew")
        self.ui["io"]["frame"].grid_columnconfigure(0, weight = 1)
        self.ui["io"]["label"] = ctk.CTkLabel(self.ui["io"]["frame"], text = "Input / Output File Paths", font = ("Arial", 16, "bold"))
        self.ui["io"]["label"].grid(row = 0, column = 0, pady = 5)
        folders = {
            "src": "Select Source Folder ...",
            "dest": "Select Destination Folder of (.c) File..."
        }
        for i, (it, placeholder) in enumerate(folders.items()):
            btn_title = "Source Folder" if it == "src" else "Conversion Folder"
            chooser = Path_Chooser(self.ui["io"]["frame"], placeholder, btn_title = btn_title)
            chooser.on_change = lambda c = chooser, k = it: self.error_popup(lambda: self.save_to_config("folders", k, c.entry.get()))
            chooser.grid(row = i + 1, column = 0, sticky = "nsew", padx = 2, pady = 1)
            self.ui["io"]["frame"].grid_rowconfigure(i + 1, weight = 1)
            self.ui["io"]["path_choosers"][it] = chooser
            folder_path = self.path_settings.get("folders", {}).get(it, "")
            if folder_path:
                chooser.entry.insert(0, folder_path)
        self.ui["io"]["filename_input"] = Filename_Input(self.ui["io"]["frame"], "", on_confirm = lambda filename: self.error_popup(lambda: self.save_to_config("output_c_file", None, filename)))
        self.ui["io"]["filename_input"].grid(row = 4, column = 0, sticky = "nsew", padx = 2, pady = 1)
        self.ui["io"]["frame"].grid_rowconfigure(4, weight = 1)
        filename = self.path_settings.get("output_c_file", "").strip().replace(" ", "_") or "fsdata.c"
        if not filename.lower().endswith(".c"):
            filename += ".c"
        self.ui["io"]["filename_input"].entry.delete(0, "end")
        self.ui["io"]["filename_input"].entry.insert(0, filename)
        
        # right frame: execution
        self.ui["exec"]["frame"] = ctk.CTkFrame(self, corner_radius = 0)
        self.ui["exec"]["frame"].grid(row = 0, column = right_col, sticky = "nsew")
        self.ui["exec"]["frame"].grid_columnconfigure(0, weight = 1)
        self.ui["exec"]["label"] = ctk.CTkLabel(self.ui["exec"]["frame"], text = "Execution", font = ("Arial", 16, "bold"))
        self.ui["exec"]["label"].grid(row = 0, column = 0, pady = 5)
        executions = {
            "compress_then_convert": utils.compress_then_convert,
            "convert": utils.convert_files
        }
        exec_btn_texts = {
            "compress_then_convert": "Compress ⇒ Convert",
            "convert": "Convert"
        }
        for i, (it, func) in enumerate(executions.items()):
            self.ui["exec"][it]["frame"] = ctk.CTkFrame(self.ui["exec"]["frame"], corner_radius = 0)
            self.ui["exec"][it]["frame"].grid(row = i + 1, column = 0, sticky = "nsew", padx = 2, pady = 1)
            self.ui["exec"][it]["frame"].grid_columnconfigure(0, weight = 1)
            self.ui["exec"]["frame"].grid_rowconfigure(i + 1, weight = 2)
            self.ui["exec"][it]["button"] = ctk.CTkButton(self.ui["exec"][it]["frame"], text = exec_btn_texts[it], width = 100, height = 40, font = ("Arial", 18, "bold"), command = lambda f = func: self.error_popup(f))
            self.ui["exec"][it]["button"].pack(expand = True)
    
    def center_window(self, window_h: int, window_w: int):
        try:
            w, h = self.winfo_screenwidth(), self.winfo_screenheight()
            x = (w // 2) - (window_w // 2)
            y = (h // 2) - (window_h // 2)
            self.geometry(f"{window_w}x{window_h}+{x}+{y}")
        except:
            self.geometry(f"{window_w}x{window_h}+100+100")
    
    def save_to_config(self, key: str, subkey: str, val: str = None):
        if key and val:
            if key == "output_c_file":
                utils.save_user_configs("output_c_file", {"output_c_file": val})
            elif key == "folders" and subkey:
                utils.save_user_configs("folders", {subkey: val})
    
    def error_popup(self, func):
        try:
            func()
        except CC_Errs.CC_Java_Err as e:
            messagebox.showerror("Java Error", e.msg)
        except CC_Errs.CC_Tool_Err as e:
            messagebox.showerror(e.title, e.msg)
        except CC_Errs.CC_Exec_Err as e:
            messagebox.showerror("Runtime Error", e.msg)
        except Exception as e:
            messagebox.showerror("Runtime Error", str(e))
    
if __name__ == "__main__":
    app = CTK_Window()
    app.mainloop()