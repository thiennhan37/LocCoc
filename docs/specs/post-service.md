# Post API

Implementation checklist: DTO/entity -> repository -> transactional service -> controller/error responses -> gateway routes -> HTTP integration tests -> README/context.

POST /posts (application/json), no token. Required: ownerId (UUID), mediaKey (nonblank, <=500), mediaType (0=image, 1=video). Optional: thumbKey (<=500), caption (<=200), width and height (positive integers). Returns 201, Location: /posts/{id}, and metadata including generated id and createdAt. Media keys are opaque storage identifiers; service does not fetch or upload them.

DELETE /posts/{id}?ownerId={uuid}, no token. Returns 204 for matching owner including repeat deletion, 404 for unknown ID or other owner. Soft deletion retains metadata and does not delete media storage objects. Invalid JSON, UUID, media type, missing fields or invalid sizes return 400 with ApiResponse(code,message,result), matching api-gateway-spring. Unexpected errors return a generic 500 without database details.

Service default port 8087. Gateway prefixes: /posts and /posts/**; POST_SERVICE_URL defaults to http://localhost:8087. Client-provided identity is development-only, not proof of ownership. No user existence check or user database coupling.

