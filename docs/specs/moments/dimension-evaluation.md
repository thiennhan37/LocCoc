# Embedding dimension and temporal prompt evaluation

Date: 2026-11-17. Authorized local experiment: download 20 additional photos,
upload through public Moments API, compare 1536 then 3072 on identical assets,
and verify Vietnamese temporal prompts. Existing data need not be deleted.

Implement dimension selection (768/1536/3072) end-to-end with a derived immutable
profile/collection per dimension, strict shape/readiness/profile validation and
owner isolation. Never mix dimensions in an existing collection. Keep the
dedicated embedding key and existing Redis quotas; do not edit secret files.

Use a dedicated album for the 20-photo corpus, labeled by visual inspection,
neutral captions, varied capturedAt dates around +07 calendar boundaries, and a
manifest with sources/hash/API IDs. Evaluate vector and public hybrid rankings;
report precision/recall/top relevant rank and no-answer separately. Preserve
query text and ranking method while comparing dimensions. A 20-photo experiment
is a smoke/diagnostic evaluation, not production quality certification.

Extend deterministic date parsing for explicit dates, months, last week/month,
inclusive day ranges and existing today/yesterday/year phrases. Reject invalid
dates and ambiguous multiple prompt intervals; explicit UI filters retain their
existing precedence. Strip recognized time phrases in prompt-only requests
before semantic embedding. Calendar boundaries use Asia/Bangkok (+07), with
inclusive dateTo retained for compatibility. Test parsing and actual API results.

Store artifacts locally: photos, contact sheet, rankings, per-query expected IDs,
date assertions and request reservations. Recommend a profile only from measured
results; switching higher dimensions alone does not guarantee improvement.
