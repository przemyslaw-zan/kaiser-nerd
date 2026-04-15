# Testing

Unit tests:
- pnpm test
- Covers fuzzy search, URL query state, and parser extraction behavior.

Coverage:
- pnpm test:coverage

Browser tests:
- pnpm test:e2e
- Uses Playwright Chromium profile.
- Validates deep links, URL updates, and filtering behavior.

CI runs type-check, lint, unit tests, build, and browser tests.
