# Security and privacy

This is a static, client-side game. There are no player accounts, backend APIs, payments, uploaded scores or player databases. The game does not ask for location, camera, microphone or filesystem access. Appearance preferences are saved in localStorage. Sharing copies a selected resort / route URL only when the player presses Share; there is a manual-copy fallback. Hosting providers can still see normal request metadata, including IP addresses. A public repository and all shipped JavaScript / assets are downloadable by anyone; never treat client code as a place for secrets.

## Controls in this repository

- Production builds apply a meta Content Security Policy: scripts and connections are limited to the same origin (local blob URLs are permitted for decoded assets); objects, base-URL changes and form submission are blocked. Inline styles remain allowed because the UI sets styles dynamically. This is defense in depth, not proof against all XSS. Meta CSP cannot enforce frame-ancestors; stronger response headers require a host that supports them.
- External Google Fonts requests have been removed. Models, terrain, textures and game code are served from the site; there are no analytics / advertising scripts.
- Dynamic route text and loading errors are escaped; loading retry uses a registered event rather than inline JavaScript. Resort / route selectors are validated against bundled data.
- GitHub Actions build jobs have read-only access; Pages write / OIDC are limited to the publishing job. Fork PRs do not deploy. Repository secrets must not be embedded in builds or exposed to untrusted code.
- The November 6, 2026 dependency audit reported zero known advisories. Gitleaks reported no credentials in the working tree. These scans have limited coverage and are not a penetration test or security guarantee.

## Availability and DDoS

A DDoS attack overloads access; it does not inherently reveal files from a player's computer or give an attacker repository write permission. Static hosting reduces backend attack surface, but attacks / traffic spikes can still cause throttling, quota use and outages. GitHub Pages documents a 100GB/month soft bandwidth limit and a 1GB published-site limit, and can rate-limit traffic. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

For broad promotion, use a domain you control, choose a CDN/static host with explicit DDoS protections and cache controls, and review account limits first. [Cloudflare documents automatic DDoS protection](https://developers.cloudflare.com/ddos-protection/) across its plans, but protections and cache behavior depend on correct onboarding; no Cloudflare service is currently configured for this project. A proxy does not hide or protect a still-public github.io origin from direct access. Migrating hosting is a separate deployment choice, not something a JavaScript change can do. Do not expose a developer's laptop / Vite dev server as the public origin.

Enable a passkey / 2FA and recovery codes for the GitHub owner account. Restrict repository write access and review third-party apps, workflow changes and dependency updates. These account controls have not been changed or verified by this code review. Keep a known-good release available for rollback. Future accounts, leaderboards, uploads or payments require a fresh threat model and server-side validation.

## Reporting

Do not post active credentials, personal data or exploit details in a public issue. Use the repository owner's private contact if available, or GitHub private vulnerability reporting if enabled. This document does not assert that private reporting is currently configured.
