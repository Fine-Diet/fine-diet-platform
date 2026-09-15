# NDS-01B evidence manifest

UTC capture: 2026-09-13.

Private env files were not opened. Names present on disk: `.env.local`, `.env.production.local`, `.env.qa.local`.
`next build` was not invoked because Next.js 14 autoloads those files.

| Artifact | SHA-256 | Raw exit |
| --- | --- | --- |
| A01-A08-TRACEABILITY.md | 942e5e1fd74a13189502e6e45ae7fd202b018d8d551ebabdcba79ebf60c4c1ec | n/a |
| localdb-integrity.log | bcc76b7fcd8a6505cfbe3008fcb74e63b8b0e84d26a98dc9b7cfaf70f460afe4 | 0 (21/21) |
| nds-targeted-jest.log | c7011f954799f6560cd3fe5a4fe7ea012492d9cf104c923fc47e8635c6180cc6 | 0 |
| npm-test-full.log | 13239f666e19bbefe26d1856a1600e66bfe01d7b9971e7155329c63dafe44db9 | 1 (3841 passed / 1 failed / 3842; pre-existing `planRepeat/policy.test.ts`) |
| verify-entitlements.log | 21ee63a6e042b596273c61315147831ea499cac40c26a8c4b2716b7fdc97f121 | 0 |
| capability-probe.log | 785c4d013dbd98ceb4a4199b52f1f567fdf550b476249df8dd4045611dcafd13 | n/a |

`NDS01B_LOCAL_APP_URL` unset. Playwright package present. Authenticated API and browser checks remain BLOCKED_NOT_RUN.
