# Unified AI and Java Post runtime

The former Nest image runtime is merged into Python `ai-service`. See
[ADR-020](../adr/ADR-020-unified-python-ai.md) and [deployment guide](unified-ai.md).

| Runtime | Port | Responsibility |
| --- | --- | --- |
| Python ai-service | 8087 | Enhancement module and internal embeddings/Qdrant search |
| Java post-service | 8089 | Social posts, private Moments, S3/ACL and indexing/erasure jobs |
| Nest chat-service | 8083 | Conversations/messages |

Gateway AI_SERVICE_URL and Java POST_AI_SERVICE_URL both target Python (:8087).
Public image path remains `/ai/images/enhance`; Gateway injects AI_SERVICE_TOKEN
only for that operation. `/internal/*` also requires the signed Post actor and
is never exposed through Gateway. Both `/posts` and `/moments` route to Java.

The `moments` Compose profile starts Python + Java and S3 dependencies. No
ai-service-2, separate Nest enhancement process, or Nest Moments process is needed.
