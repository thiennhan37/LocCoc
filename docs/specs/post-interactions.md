# Centered feed, post reactions and direct chat

User requires centered post pages matching reference, direct chat to author, and explicitly chose persisted reactions on posts (not emoji chat messages).

Layout: square rounded photo centered horizontally and vertically within the available post page, constrained to phone-like max width; author/time below image; interaction strip below. On short screens shrink photo to preserve controls and large-text usability. Preserve one post per swipe and dwell tracking.

Chat: use existing ChatController.openDirect(ownerId) and ChatDetailScreen with the current authenticated UserApiClient. Hide self-message action. Do not send a message merely on opening; chat composer handles sending/retry. Backend keeps existing friendship/block policy.

Reactions: post-service owns table post_reactions, unique viewer/post. GET /posts/{id}/reactions returns {counts: {emoji: integer}, myReaction: string|null}. PUT /posts/{id}/reaction {emoji} sets/replaces; DELETE removes. Allowed emoji: 💛, 🔥, 😍, 😂, 👏. Writes are idempotent and serialize using existing post lock; viewer comes only from JWT-backed FeedAudienceClient and each operation checks current post visibility/deleted status. No client owner/viewer identity accepted. Owners cannot add, change or remove reactions on their own posts (403). They can read received counts; historical self-reaction rows are preserved but excluded from counts and myReaction. No reactor identity is exposed. Persistence is in posts.public.post_reactions; the legacy reactions table is not used by this API. API uses existing /posts gateway proxy.

Mobile lazily loads summaries for active post, displays server counts/selection, disables controls during writes, preserves old state on errors and offers retry. Chat and reaction operations must not cross accounts after logout/switch. Tests cover authorization, unavailable/deleted posts, uniqueness/change/remove/retry, gateway verbs, mobile sender JWT/owner selection, centering and large text.
