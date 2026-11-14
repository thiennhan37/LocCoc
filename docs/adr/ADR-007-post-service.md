# ADR-007: Spring post creation and soft deletion

Use the existing Spring Boot post-service with Controller -> Service -> JPA Repository and validated DTOs. Store moments in its own database; ownerId is an external user UUID, without a cross-service foreign key. Match the reviewed moments schema (mediaKey, mediaType 0=image/1=video, thumbKey, caption, dimensions, timestamps).

POST /posts accepts JSON metadata for media already uploaded. DELETE /posts/{id}?ownerId=UUID marks deleted_at using an atomic owner-scoped update. A repeated delete by the same owner returns 204; unknown posts or another owner return 404. Media object deletion, upload, recipients and feed distribution are deferred.

Authentication is intentionally absent for local development while auth is unfinished. ownerId is untrusted and can be impersonated; replace it with the verified principal before public deployment. Do not consider the owner comparison authentication.

Use a persistent H2 database for zero-setup local development, with environment-configurable PostgreSQL support for deployment. No IAM database access. Both gateways forward /posts. Add HTTP integration tests for persistence, validation and deletion semantics.
