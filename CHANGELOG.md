# Changelog

All notable changes to AgentWarden will be documented in this file.

The format follows Keep a Changelog style, and this project aims to use semantic versioning after the first public release.

## 0.1.0 - Unreleased

### Added

- Deterministic EVM transaction analyzer for agent-common transaction surfaces.
- Policy checks for mismatched intent, risky approvals, suspicious multicalls, unknown selectors, hidden native value, and EIP-7702 authorization lists.
- API endpoint for transaction analysis.
- MCP stdio server exposing `analyze_transaction`.
- MCP demo client for safe-transfer and malicious-approval flows.
- Attack payload suite with markdown and JSON demo reports.
- Initial x402 integration parked behind disabled-by-default configuration.
