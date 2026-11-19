# ADR-020: Separate AI preview from post publication

Accepted 2026-11-17. See [contract](../specs/post-ai-preview.md).

Post-service authenticates and records a unique attempt before calling ai-service.
The mobile composer accepts the returned image separately from publishing. This
keeps paid generation out of retries of post creation. The ledger deliberately
rejects duplicate attempts instead of storing potentially large private images.
No real provider calls are required to test this integration.
