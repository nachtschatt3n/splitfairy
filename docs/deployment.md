# Deployment and release

The public application repository publishes `ghcr.io/nachtschatt3n/splitfairy`. `cberg-home-nextgen` owns all Kubernetes manifests and secrets. No application workflow holds Kubernetes credentials.

1. Pull request CI runs two jobs in parallel. **verify** runs typecheck, unit/API tests, the production build, and the browser tests. **image** builds the container and smoke-tests it: readiness, the PWA shell, a backup run, and a clean exit on SIGTERM.
2. Every push to `main` runs the same two jobs. The image is published as a candidate tagged `sha-<commit>`. Main runs are never cancelled, so every main commit stays releasable. Nothing deploys from `main`.
3. Tag a commit that is on `main` with `v<major>.<minor>.<patch>` (for example `git tag v0.3.1 && git push origin v0.3.1`). The tag run does not test again. It checks that **verify** passed for that exact commit, waits for its `sha-` image, and re-tags it with the version without rebuilding. An untested or failed commit is never released. A release takes about a minute after `main` is green.
4. In `cberg-home-nextgen` (`kubernetes/apps/my-software-production/splitfairy/app/image-automation.yaml`), an ImagePolicy selects the newest tag matching `^v\d+\.\d+\.\d+$`. Flux ImageUpdateAutomation rewrites the HelmRelease tag marker and commits to `main`, then Flux deploys. `sha-*` and pre-release tags are ignored.
5. Confirm HTTPRoute, readiness, receipt extraction, SMTP delivery, Longhorn binding, alerts and log ingestion after the first release. Verify the real Gemma endpoint from the private network.

Rollback means reverting the GitOps image digest to a prior version with a compatible database schema. Never restore an older image after a destructive migration without restoring its matching backup. Keep schema changes additive within a release series.
