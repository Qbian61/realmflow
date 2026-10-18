# RealmFlow Agent Instructions

## Requirement Delivery

For feature implementation, bug fixes, behavior changes, refactors, or any
request that should proceed from a product requirement through acceptance,
read and follow:

`.agents/skills/requirement-delivery/SKILL.md`

This workflow is mandatory unless the user explicitly limits the task to a
single read-only or documentation-only phase.

Do not commit or push changes unless the user explicitly requests it.

## Development Verification Boundary

During development, do not generate macOS application or distribution
artifacts by default.

- For ordinary feature work or bug fixes, verify with focused tests,
  typecheck when relevant, targeted runtime smoke checks, and
  `git diff --check`.
- Do not run `npm run dist:mac`, generate `RealmFlow.app`, `.pkg`, or `.zip`,
  or perform signing/notarization unless the request explicitly targets
  packaging, installer behavior, `app.asar`, `Contents/Resources`, native
  runtime distribution, or a defect that only reproduces in a packaged app.
- `.pkg`, `.zip`, Developer ID signing, and Apple notarization are release
  activities, not default development acceptance.
