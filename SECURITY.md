# Security

Playgrounds is a set of static pages with no server, accounts or database. Progress is stored in the visitor's browser (`localStorage`, optional exported JSON file).

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Include what you found, steps to reproduce, and the browser you used. We aim to reply within a week.

## What counts

- Script injection (XSS) through content, imported progress files or URLs.
- Anything that lets one page read or damage another origin's data.
- Supply-chain problems: a compromised CDN script, a malicious dependency or workflow change.

## Out of scope

- Hand-edited progress JSON giving yourself XP (progress is not tamper-proof by design).
- The practice shells and interpreters running arbitrary input in your own browser tab; that is the product.

## Supply chain notes for contributors

Do not add runtime dependencies or new CDN hosts without an issue. Pin versions and keep Dependabot enabled.
