# Splitfairy implementation plan

Approved in conversation: Splitfairy — So we split fairly. Public nachtschatt3n/splitfairy and GHCR image. Single Node/SQLite app; private Ollama gemma4:26b-mlx at 192.168.30.111:11434. EUR, individual weights rolled into families, meals/shopping/events, receipt review, offline mutation queue, email invite/code authentication. Mediterranean cream/teal/terracotta responsive UI. Version releases promote tested images and update cberg-home-nextgen through a checked auto-merge PR, Flux deploys.

## Stages
1. Domain models/accounting with conservation and exact small-group settlement tests.
2. SQLite persistence, invitation/email login, authorization, versioned mutation API and receipt jobs.
3. Responsive PWA: Today/Plan/Expenses/Balances, receipt review, family setup, offline sync/conflicts.
4. CI, hardened container, release/GitOps, backup/restore, documentation.
5. Browser/integration verification, independent review, publish and deployment verification.

## Constraints
Money integer cents; immutable posted allocations and auditable revisions. No new model host, no cloud receipt processing. Exact settlement <=15 nonzero wallets, labeled greedy beyond. Email-code invitations; children need no account. No bank movement. No public signup. Real AI check separate from synthetic CI. No plaintext deployment secrets. No destructive database downgrade. Follow existing cluster SOP and SOPS.

## Progress
- Bootstrap: new isolated repo, feature branch. Node 24 native SQLite chosen to avoid native database build dependencies. No existing baseline.
- 2026-09-28: Baseline green (19 unit tests, build, onboarding e2e). Receipt lifecycle (posted/dismissed, void releases, retry), a receipt review with per-meal assignment and reconciliation, ordered offline replay with conflict/rejected parking and session-expiry handling, domain errors as 400, security headers, structured logs, graceful shutdown, pruning, ISO receipt dates, and a real AI smoke check (`npm run smoke:ai`, gemma4:26b-mlx passed). 36 unit/API tests and 3 browser tests (mobile and desktop receipt-to-settlement). Production start and backup/restore verified. CI builds and smoke-tests the container on PRs; tags promote the tested main image. GitOps prepared in cberg-home-nextgen on feat/splitfairy (my-software-production, envoy-external, Longhorn static volume, Flux image automation on v* tags).
