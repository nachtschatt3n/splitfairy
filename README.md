# Splitfairy

**So we split fairly.** A mobile-first, installable vacation planner for shared meals, shopping, expenses, receipts and family settlement.

The app serves its PWA and API from one Node.js container. SQLite and receipt photos live on `/data`; a private Ollama vision endpoint drafts receipt items. The server calculates money and requires human review before posting.

## Local development

Requires Node.js 24 and SMTP. Copy `.env.example` to `.env`, fill in `ADMIN_EMAIL`, a random `AUTH_SECRET` of at least 32 characters, and SMTP credentials. Load the variables into your shell, then run:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The administrator signs in with an emailed one-time code, creates a trip and invites others by email. A local SMTP testing server is fine; no external AI service is needed for manual expenses. Use `npm run check` and `npm run test:e2e` before a release.

## How expenses work

Create families and people first. Each person has a weight; meals and activities select their participants. Quick expenses inherit the people on their chosen event. A photographed receipt is scanned by the configured Ollama model and placed in a review inbox.

Receipt review shows the photo next to the extracted items. Fix names and prices, remove or add items, and assign each item to a meal, an activity, or *General · everyone*. If the receipt date matches exactly one planned meal, its items start assigned to that meal. A summary shows each assignment's subtotal and how many people share it. Confirmation stays disabled until the items add up to the receipt total, and a one-click line can absorb an explained difference such as a deposit or discount. Each item is split by its own participants' weights, to the cent. A confirmed receipt leaves the inbox and cannot be posted twice. Voiding its expense returns it to the inbox. Failed extractions can be retried or discarded. The payer is separate from those charged.

Balances roll people into family wallets. Repayments preserve every family's net position and minimize transfers for up to 15 nonzero family wallets. Above that size the app displays a deterministic simplified proposal, labeled as potentially nonminimal. Splitfairy records repayments but does not move funds.

## Operations

Set `ADMIN_EMAIL`, `AUTH_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true` for TLS on 465, `false` for STARTTLS on 587), `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `OLLAMA_URL`, and `OLLAMA_MODEL`. `LOG_LEVEL` defaults to `info`; logs are JSON on stdout. The server stops cleanly on `SIGTERM`, exposes `/healthz` (process) and `/readyz` (database), and prunes expired sessions and codes daily. Use HTTPS for production. Keep one replica and a `Recreate` rollout for the SQLite volume. Mount durable block storage at `/data`; do not use NFS or SMB for SQLite WAL.

Run `npm run backup` inside the app container to create an application-consistent SQLite backup plus receipt copy under `/data/backups/YYYY-MM-DD`. The script retains seven daily copies. The deployment should also back up the Longhorn volume off-volume. To restore, stop the app, copy `splitfairy.sqlite` and `receipts/` from a backup into `/data`, then start it again. Test restore on a separate volume before relying on backups.

`npm run smoke:ai` sends a generated test receipt through the real extraction path to `OLLAMA_URL` and checks every item, the total and the date. It needs the private network, so it is not part of CI. Run it after changing the model or prompt. The request sets `think:false`, `temperature:0` and a JSON schema in `format`. It never sends `keep_alive` or `num_ctx`, because the shared Ollama host keeps the model loaded.

Release images are built in GitHub Actions and tagged by version. The cluster GitOps repository pins the release tag and reflected immutable digest through Flux image automation. See `docs/deployment.md` for the release and rollback path.

## Privacy and scope

Only invited email addresses can sign in. Receipt photos are sent to the operator's configured private Ollama endpoint. Offline changes and photos remain in IndexedDB until synchronization; signing out asks before discarding them. A browser can remove local storage under device pressure, so pending changes should be synchronized before clearing browser data.

Initial version uses EUR and English, without bank transfers, currency conversion or public signup. [Splitaway](https://splitaway.app/help) informed the emphasis on easy receipt review and clear settlements; Splitfairy also connects expenses to vacation plans and allows editing offline.
