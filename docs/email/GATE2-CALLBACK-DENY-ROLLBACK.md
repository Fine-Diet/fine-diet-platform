# Gate 2 callback denial: review and rollback note

The route returns HTTP 410 with `Cache-Control: no-store` for every method and does not read the request, access storage, or call a provider. This intentionally disables the outbox status callback. Static repository documentation describes unauthenticated n8n POST callbacks, but the canonical Gate 2 record says the hosted workflows are unpublished. No live traffic or hosted workflow inspection was performed. Retry behavior is unknown; the repository documentation records no retry configuration.

For local source rollback, revert only `pages/api/outbox/mark-sent.ts` to the pinned base version (SHA-256 `8d796134ad6a5616b8b9b4dfef7dce46a8e31483b632e26a0ff93b6a52cd0a9a`) in a separately reviewed change. Do not restore the unauthenticated handler in production without separate security review and authorization. The test and this note can be removed with the same reviewed source change if the patch is rejected.
