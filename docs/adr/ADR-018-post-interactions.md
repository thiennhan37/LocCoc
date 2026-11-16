# ADR-018: Post reactions and author chat

Store one reaction per viewer/post in post-service and use its existing audience policy for read/write authorization. Keep direct messages in chat-service via existing direct-conversation API. Reactions are post state, not chat messages. Existing /posts/** gateway routes carry the new endpoints. Counts and the viewer selection are returned after each idempotent mutation. See docs/specs/post-interactions.md.
