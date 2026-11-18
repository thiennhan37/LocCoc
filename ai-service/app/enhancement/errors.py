class EnhancementError(Exception):
    def __init__(self, code, status, message):
        super().__init__(code)
        self.code, self.status, self.message = code, status, message
