# Development Strategy

AgentWarden uses `main` as the stable integration branch.

## Branching

- Create short-lived branches from `main`.
- Use `feature/<topic>` for new capabilities.
- Use `fix/<topic>` for bug fixes.
- Keep commits atomic and descriptive.

## Pull Requests

Every PR should include:

- a short problem statement
- implementation summary
- tests or demo commands run
- security impact notes for analyzer, MCP, x402, RPC, or contract changes

## Recommended Branch Protection

Enable these rules on GitHub before accepting external contributors:

- require pull requests before merging
- require at least one approving review
- require status checks from CI
- require branches to be up to date before merge
- block force pushes to `main`
- require conversation resolution before merge

## Commit Quality

Prefer multiple small commits over one broad dump. A useful commit should map to one logical change, such as a decoder rule, a policy check, a demo flow, or a documentation update.
