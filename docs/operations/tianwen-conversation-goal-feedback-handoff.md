# Tianwen conversation Goal feedback handoff

Date: 2026-08-31

Status: Runtime 0.1.6 implementation, official install, Desktop preview.7 packaging,
and deterministic review are complete. A valid installed-product v3 natural
acceptance is not claimed by this handoff.

## 1. Product result

The ordinary DSH conversation remains the primary surface for continuous Goals.
Runtime 0.1.6 adds two bounded feedback paths without adding another Goal engine:

- one event-driven `conversation.input.dock` card for planning, running, paused,
  blocked, and complete v3 state; and
- one best-effort read-only natural summary in the original control conversation
  after a complete or blocked transition when the exact control Agent is live.

The card is centered, limited to 720 pixels, and uses two rows. Long objective
and Task text truncate inside the card instead of stretching across the full
window. It adds no buttons, polling, scheduler, retry queue, or persistent
delivery ledger. The Long-running goals panel remains optional history.

Terminal delivery waits for the control Agent outside the per-Goal lane, rereads
the durable v3 state, supplies bounded Task results as untrusted historical data,
and denies tools for the one summary Turn. A delivery failure does not change the
durable Goal result and is not retried automatically.

## 2. Implemented commits

The reviewable implementation chain on `codex/goal-chat-feedback` includes:

- `283b2bb` — conversation Goal feedback dock;
- `8250194` through `0f067a5` — bounded settlement notice, complete/blocked
  delivery, read-only Turn, and Task-scoped live deduplication;
- `a082942` and `fb785b2` — Runtime 0.1.6 / Desktop preview.7 identity and
  release-input coverage;
- `9fc4525` — preserve the existing Desktop Profile pnpm store during update;
- `f22515d` — replace the full-width one-line dock with the compact two-row card.

## 3. Deterministic and packaging evidence

The focused client suites passed after the compact-card change: 59 tests, 0
failures. The Runtime bundle suite passed 62 tests. The Desktop Profile-prepare
suite passed 20 tests. Earlier focused core feedback suites passed 179 tests;
the broader independent check reported 89 passed and 9 environment-skipped,
with TypeScript, Runtime build, private-import, and diff checks passing.

Independent reviewers found no Critical, Important, or Minor issue in either
the delivery identity chain, the pnpm-store preservation fix, or the final
compact-card change.

The official installer upgraded the managed product root at
`D:\DevData\tianwen-experience` to Runtime 0.1.6 on exact DSH 0.1.1-rc.2 and
returned `status=ready`. Existing Session files and settings were retained.
The installed Runtime archive is:

```text
D:\DevData\tianwen-experience\packs\tianwen-runtime-bundle-0.1.6.tgz
SHA-256 51C05476F9B6DDF1A7A8C880D5592B7C8E4C1D94DFCB14362D077D021735F4F1
```

Desktop `0.1.0-preview.7` was rebuilt with that exact archive. The unpacked
artifact audit passed. The final installer is:

```text
D:\DevData\tianwen-0.1.6-artifacts\Tianwen Desktop Setup 0.1.0-preview.7.exe
SHA-256 B9DB4A64252A7FDD45E8F2EF2EBE662C592034383BC4E2A879540DC5CD3C77B7
```

The existing desktop shortcut still targets the rebuilt `win-unpacked` product,
and the restarted Desktop kept its DSH Web listener alive.

## 4. User screenshot and historical state

The reported screenshot showed two separate facts:

1. the main transcript had no terminal summary; and
2. the Goal status occupied one very long horizontal row.

The durable record proved that the displayed Goal was historical: v3 Goal
`tianwen-long-goal-4342fc36-6fcc-432e-9fe6-165207f8ddc6`, revision 12, five
Tasks complete, last written before Runtime 0.1.6 was installed. Runtime 0.1.6
does not wake an already-complete historical Goal merely to manufacture a new
Provider summary. That missing historical backfill is expected. The one-line
layout was a current UI defect and is fixed by `f22515d`.

## 5. Natural runtime evidence and controller mistakes

One configured DeepSeek ordinary Agent Turn was run in the isolated workspace
`D:\DevData\tianwen-goal-feedback-proof-016`. It used
`deepseek-official/deepseek-v4-pro`, implemented a small reading-list CLI, and
ended normally. The Agent's nine tests passed again under independent controller
execution. This is useful ordinary DSH Agent evidence, but it is **not** Tianwen
continuous-Goal evidence.

The reason is exact and does not establish a product defect: the controller sent
the text directly to HTTP `session.prompt`. The real DSH composer detects a
leading slash and calls the separate client `session.command` path first. Direct
`session.prompt` bypassed that client adjudication, so the model received the
literal `/goal` text and created a native DSH Goal inside one ordinary Turn.

A second controller call used Tianwen's public `create-goal-first` endpoint. That
endpoint is the retained manual v2 flow, not the `/goal` continuous v3 command.
Its first read-only Task completed and the v2 Goal remained honestly at planning
with one of three Tasks complete. It was not manually advanced to manufacture a
passing result.

No third Provider run was started. Neither controller invocation is counted as
valid Runtime 0.1.6 v3 acceptance, and neither is misreported as a Tianwen product
failure. Internal Session event counts are not Provider billing or cost facts.

## 6. Acceptance boundary and next evidence

Code, focused tests, official installation, Desktop startup, artifact identity,
and the compact UI repair are closed. The only unclaimed item is one valid v3
natural run that visibly crosses a Task boundary and reaches complete or blocked
state in the original conversation.

That evidence should now come from normal product use: enter `/goal <objective>`
in the visible DSH/Tianwen Desktop composer and use the product for a genuinely
useful task. Do not create another synthetic Activity or controller-only Goal.
After the ordinary run reaches a terminal state, preserve the control Session,
v3 Long Goal record, and final conversation output once. A successful ordinary
run may close this evidence boundary without changing the Runtime code.
