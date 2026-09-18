# Runtime verification

`npm run verify` runs lint, format, unit/HTTP tests and production build without
credentials or a database. Build includes only `src` and verifies `dist/main.js`,
the entrypoint consumed by `npm run start:prod`.

Administrative writes remain ADMIN-only. HTTP tests verify anonymous 401,
CUSTOMER/DEALER 403, ADMIN access and rejection of ADMIN public registration,
with mutation methods untouched for rejected requests. Database providers are
stubbed; these checks do not provision, delete or seed records.

Security dependency updates retain current major versions: Nodemailer 9.1.1,
Multer 2.4.0 through an override of Nest's pinned transitive dependency, and
compatible brace-expansion patch releases. There are no multipart interceptors
in current routes; email notifications use plain text, without attachments.
`npm audit` reported zero vulnerabilities after the update on 2026-09-18.

Primary advisories:

- https://github.com/expressjs/multer/security/advisories/GHSA-535w-7cp7-47q4
- https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8m3c-c648-2xjj
- https://github.com/advisories/GHSA-rgw5-rvv9-x895

No live inference or production database writes are part of verification.
