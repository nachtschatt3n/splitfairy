---
name: splitfairy
description: Work with Splitfairy, a self-hosted group-trip planner that splits costs fairly between families. Use when the user asks about a shared trip or vacation - who is coming, meals, restaurants and activities, shopping and packing lists, cars and flights, where everyone sleeps - or wants to add or split an expense, see who owes whom, or settle up. Covers create, update and delete for everything in a trip. Confirm with the user before deleting or voiding anything.
metadata: {"openclaw":{"requires":{"env":["SPLITFAIRY_PAT"],"bins":["curl"]},"primaryEnv":"SPLITFAIRY_PAT"}}
---

# Splitfairy

Splitfairy keeps one shared **trip** per vacation: families and people, a day-by-day plan (meals, restaurants, activities, travel, stays), shopping and packing lists, expenses and repayments. Costs are split per person (adult share 1, child 0.5, baby 0 by default) and settled **per family**.

- App: `${SPLITFAIRY_URL:-https://splitfairy.uhl.cool}`; links: `/trips/<id>`, `/trips/<id>/plan/<YYYY-MM-DD>`, `/trips/<id>/spend`, `/trips/<id>/settle`
- Auth: a personal access token in `SPLITFAIRY_PAT` (created in the app under People & settings → AI assistants). It acts as that user, with their trips and roles.

## How to connect

Prefer the MCP tools when a `splitfairy` MCP server is connected (`${SPLITFAIRY_URL}/mcp`, header `Authorization: Bearer $SPLITFAIRY_PAT`). Otherwise use the REST API with curl (below). Both enforce the same rules.

| MCP tool | What it does |
|---|---|
| `list_trips` | Trips you belong to, with ids and links |
| `get_trip` | Everything in a trip plus your role; read ids from here |
| `create_trip` / `update_trip` / `delete_trip` | Trip name, dates, theme, archive; delete needs `confirm: true` |
| `save_item` | Create (no `id`) or partially update (with `id`) a family, person, event, shopping, gear, transport, stay, leg, expense or payment |
| `delete_item` | Remove an item; expenses are voided instead (restorable) |
| `add_expense` | Add a cost with a split: `families` (default), `equal`, `shares`, `exact`, `percent`, `adjust`; or `plan_id` to split among a plan's participants |
| `get_balances` | Balance per family and the fewest repayments to settle |
| `invite_member` | Let someone sign in to the trip (organizers) |

## Working rules

1. Start with `list_trips`, pick the trip (ask if several match), then `get_trip` once to learn ids of families, people, plans and vehicles. Refer to people and families by name when talking to the user.
2. Money: tools take euros (`amount_eur`); stored amounts and REST use **cents**. Refunds are negative.
3. Dates are `YYYY-MM-DD`, times `HH:MM` (24 h). A stay's `to` is the check-out day.
4. Before deleting, voiding, archiving or changing someone else's expense, say what will happen and get a yes. Voided expenses can be restored by saving `status: "posted"`.
5. Only organizers can change trip settings, members and other people's expenses; a 403 means "ask an organizer".
6. After changes, give the user the app link to check, e.g. `/trips/<id>/spend`.

## Common tasks (MCP)

- "Add dinner at Tasca do Chico on Friday for the Uhls": `save_item` entity `event` `{title, date, time, kind:"restaurant", address, participants:[{id, weight}]}`; later `add_expense` with `plan_id` for the bill.
- "Mathias paid 84 € for the boat, split 50/30/20": `add_expense {title:"Boat", amount_eur:84, paid_by:"Uhl", split:{mode:"percent", values:{"Mathias":50,"Andrea":30,"Will":20}}}`.
- "Put the travel cot in the Weber plane, then the Silva car": `save_item` entity `gear` `{id, route:[planeId, carId]}`.
- "The Moncriefs arrive at the house on Sunday at 18:00": `save_item` entity `stay` `{id, schedule:[…existing, {familyId, arriveDate, arriveTime}]}` (send the whole list; the booking link goes in `url`). Stay documents are uploaded in the app.
- "Who owes whom?": `get_balances`.

## REST fallback (curl)

```bash
API="${SPLITFAIRY_URL:-https://splitfairy.uhl.cool}/api/v1"; AUTH="Authorization: Bearer $SPLITFAIRY_PAT"
curl -s -H "$AUTH" "$API/trips"                                # list trips
curl -s -H "$AUTH" "$API/trips/$TRIP"                          # {trip, role}
curl -s -H "$AUTH" "$API/trips/$TRIP/settlement"               # {balances, transfers} in cents
curl -s -H "$AUTH" -H 'content-type: application/json' -X POST "$API/trips" -d '{"name":"Algarve","start":"2026-10-01","end":"2026-10-08"}'
```

Every change to a trip is one command: `POST $API/trips/$TRIP/commands` with
`{"mutationId":"<new uuid>","entity":"<entity>","action":"save"|"delete","expectedVersion":<current item version, 0 when new>,"value":{...full item, "version":<same>}}`.
Entities: `family, person, event, shopping, gear, transport, stay, leg, expense, payment, trip`. Read the current item from `GET /trips/$TRIP` first and send the whole item back with your changes; a 409 means someone changed it meanwhile, so re-read and retry. Expenses need `payers` and `lines[].splits[]` summing to `total` (cents); prefer the MCP `add_expense` tool, or copy the shape of an existing expense.
