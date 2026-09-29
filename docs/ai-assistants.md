# AI assistants: MCP, access tokens and the Splitfairy skill

Splitfairy can be used from Claude, Codex, OpenClaw or any MCP client. Everything you can create, change or delete in a trip is available.

## 1. Create a personal access token

In the app: **People & settings → AI assistants & access tokens → Create token**. Copy it right away; it is shown once. A token acts as you (your trips, your role) and can be revoked there at any time. Tokens cannot create other tokens.

Keep it in an environment variable:

```bash
export SPLITFAIRY_PAT=sfp_…
export SPLITFAIRY_URL=https://splitfairy.uhl.cool   # optional, this is the default
```

## 2. Connect the MCP server

The server speaks MCP over Streamable HTTP at `https://splitfairy.uhl.cool/mcp` with `Authorization: Bearer <token>`.

**Claude Code**

```bash
claude mcp add --transport http splitfairy https://splitfairy.uhl.cool/mcp \
  --header "Authorization: Bearer $SPLITFAIRY_PAT"
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.splitfairy]
url = "https://splitfairy.uhl.cool/mcp"
bearer_token_env_var = "SPLITFAIRY_PAT"
```

**OpenClaw** (`openclaw.json`, or `openclaw mcp set`)

```json
"mcp": { "servers": { "splitfairy": {
  "url": "https://splitfairy.uhl.cool/mcp",
  "transport": "streamable-http",
  "headers": { "Authorization": "Bearer ${SPLITFAIRY_PAT}" }
} } }
```

Tools: `list_trips`, `get_trip`, `create_trip`, `update_trip`, `delete_trip`, `save_item`, `delete_item`, `add_expense`, `get_balances`, `invite_member`.

## 3. Install the skill

The skill in [`skills/splitfairy/SKILL.md`](../skills/splitfairy/SKILL.md) teaches an assistant how trips, splits and settling work, and falls back to the REST API with `curl` when no MCP server is connected. It uses the shared Agent Skills format:

| Assistant | Where it goes |
|---|---|
| Claude Code | `~/.claude/skills/splitfairy/SKILL.md` (or `.claude/skills/` in a project) |
| Codex | `~/.codex/skills/splitfairy/SKILL.md` |
| OpenClaw | `<workspace>/skills/splitfairy/SKILL.md` (managed: `~/.openclaw/skills/`). Needs `SPLITFAIRY_PAT` in the environment and `curl`; the skill declares both in `metadata.openclaw` |

```bash
for dir in ~/.claude/skills ~/.codex/skills; do mkdir -p "$dir/splitfairy" && cp skills/splitfairy/SKILL.md "$dir/splitfairy/"; done
```

For the cberg OpenClaw deployment: add the file as key `skill-splitfairy.md` to `kubernetes/apps/ai/openclaw/app/skills-configmap.sops.yaml` and `SPLITFAIRY_PAT` to `openclaw-secret` (both through GitOps/SOPS); the init step copies skills to `~/clawd/skills/<name>/SKILL.md` on boot.

## REST API

The same token works for the REST API at `/api/v1` (`Authorization: Bearer …`). Changes go through `POST /api/v1/trips/<id>/commands`; see the skill for the command format.
