# Project memory

## Product intent & audience

- Node.js/npm application deployed via a platform that builds from `/home/project/`.
- Specific product purpose and target audience not yet established.

## Brand personality & voice

- Not yet inferred from project context.

## Visual design & UX direction

- No visual/UX context available yet.

## Decisions, constraints & rationale

- `.bolt/prompt` is authoritative for global instructions (currently empty).
- Deployment environment expects `package.json` at root path `/home/project/package.json`.
- Recurring issue: project files nested inside a `project/` subfolder instead of root; fix = move files up to root. Has occurred multiple times.

## Open questions & assumptions

- Unknown: project framework, specific features, and deployment platform details.
- Assumption: after moving files to root, deployment should succeed (unverified).