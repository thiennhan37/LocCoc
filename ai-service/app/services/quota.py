from datetime import datetime, timezone

from app.core.errors import SemanticError
from app.core.security import cache_key

# Reserve all limits atomically, before the outbound call. Ambiguous failures are
# intentionally not refunded: a timeout may already have been billed.
RESERVE = """
for i=1,#KEYS do
  if tonumber(ARGV[i*2-1]) <= 0 or tonumber(redis.call('GET',KEYS[i]) or '0') >= tonumber(ARGV[i*2-1]) then
    return 0
  end
end
for i=1,#KEYS do
  local n=redis.call('INCR',KEYS[i])
  if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[i*2]) end
end
return 1
"""


class Quota:
    def __init__(self, settings, redis):
        self.settings = settings
        self.redis = redis

    async def reserve_search(self, owner: str):
        now = datetime.now(timezone.utc)
        digest = cache_key(self.settings.AI_ACTOR_SECRET.get_secret_value(), owner, "rate", "")
        key = f"moments:search:{digest}:{now:%Y%m%d%H%M}"
        try:
            allowed = await self.redis.eval(RESERVE, 1, key, self.settings.AI_OWNER_SEARCH_RPM, 120)
        except Exception:
            raise SemanticError("QUOTA_UNAVAILABLE") from None
        if allowed != 1:
            raise SemanticError("OWNER_RATE_LIMITED", 429)

    async def reserve(self, operation: str):
        now = datetime.now(timezone.utc)
        keys = [
            f"moments:gemini:{operation}:{now:%Y%m%d%H%M}",
            f"moments:gemini:day:{now:%Y%m%d}",
            f"moments:gemini:month:{now:%Y%m}",
        ]
        limit = self.settings.GEMINI_QUERY_RPM if operation == "query" else self.settings.GEMINI_INGEST_RPM
        try:
            allowed = await self.redis.eval(
                RESERVE,
                3,
                *keys,
                limit,
                120,
                self.settings.GEMINI_DAILY_REQUEST_CAP,
                172800,
                self.settings.GEMINI_MONTHLY_REQUEST_CAP,
                32 * 86400,
            )
        except Exception:
            raise SemanticError("QUOTA_UNAVAILABLE") from None
        if allowed != 1:
            raise SemanticError("PROVIDER_QUOTA_EXHAUSTED", 429)
