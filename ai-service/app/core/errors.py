class SemanticError(Exception):
    def __init__(self, code: str, status: int = 503, retry_after: int = 30):
        self.code = code
        self.status = status
        self.retry_after = max(1, min(3600, retry_after))
        super().__init__(code)
