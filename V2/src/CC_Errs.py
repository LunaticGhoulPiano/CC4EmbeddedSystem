class CC_Base_Err(Exception):
    def __init__(self, msg: str):
        super().__init__(msg)
        self.msg = msg

class CC_Java_Err(CC_Base_Err):
    def __init__(self, msg: str):
        super().__init__(msg)
        self.msg = msg

class CC_Tool_Err(CC_Base_Err):
    def __init__(self, msg: str, title:str):
        super().__init__(msg)
        self.msg = msg
        self.title = title

class CC_Exec_Err(CC_Base_Err):
    def __init__(self, msg: str):
        super().__init__(msg)
        self.msg = msg