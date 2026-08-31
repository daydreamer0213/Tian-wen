# Tianwen conversation Goal feedback handoff

> **Historical 0.1.7 handoff:** the installed dock and compact-card work below
> remains honest release evidence, but its product decision was later rejected.
> It is superseded by
> [`Tianwen Native Conversation Progress Design`](../superpowers/specs/2026-08-31-tianwen-native-conversation-progress-design.md).
> Current code removes the dock and returns progress to ordinary assistant
> messages; do not use this handoff to infer the current UI.

Date: 2026-08-31

Status: Runtime 0.1.7 implementation, official install, Web Profile update,
Desktop preview.8 packaging, and deterministic review are complete. A valid installed-product v3 natural
acceptance is not claimed by this handoff.

## 1. Product result

The ordinary DSH conversation remains the primary surface for continuous Goals.
Runtime 0.1.7 delivers two bounded feedback paths without adding another Goal engine:

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
- `f22515d` — replace the full-width one-line dock with the compact two-row card;
- `b1e6f40` — assign the changed delivery bytes a new Runtime 0.1.7 / Desktop
  preview.8 identity and accept only Runtime 0.1.6 as the managed predecessor.

## 3. Deterministic and packaging evidence

The focused client suites passed after the compact-card change: 59 tests, 0
failures. The final release-identity run passed 202 tests across installer,
Desktop host, locale, Profile preparation, artifact, Runtime bundle, and Runtime
Profile suites. Its one initial Runtime Profile failure was only the controller's
missing required `COREPACK_HOME`; that file was rerun with the documented D-drive
environment and passed 4 tests with 3 integration cases skipped. The final
artifact suite passed 9 tests after packaging. TypeScript build and typecheck,
Runtime build, Desktop unpacked audit, and diff checks passed.

Independent reviewers found no Critical, Important, or Minor issue in either
the delivery identity chain, the pnpm-store preservation fix, or the final
compact-card change.

The official installer upgraded the managed product root at
`D:\DevData\tianwen-experience` from Runtime 0.1.6 to Runtime 0.1.7 on exact DSH 0.1.1-rc.2 and
returned `status=ready`. Existing Session files and settings were retained.
The installed Runtime archive is:

```text
D:\DevData\tianwen-experience\packs\tianwen-runtime-bundle-0.1.7.tgz
SHA-256 52889328F2C6275E88265A6C4DB921435DA14113F77FBCFA685C1FB5E5592EF9
```

Desktop `0.1.0-preview.8` was rebuilt with that exact archive. The unpacked
artifact audit passed. The final installer is:

```text
D:\DevData\tianwen-0.1.7-artifacts\Tianwen Desktop Setup 0.1.0-preview.8.exe
SHA-256 F9576CC13F694A768E6E77CCB779BE8805F95CE31E8D36954D8AE8A014F3B33C
```

The existing desktop shortcut still targets the rebuilt `win-unpacked` product.
The actual Web Profile was updated from Runtime 0.1.6 to 0.1.7 through the same
DSH `plugin --profile web --allow-build=koffi add` path used by Desktop. Its
installed `dist/client.js` has the same SHA-256 as the built client and contains
the centered 720-pixel, two-row grid and ellipsis rules. The restarted Desktop
kept its DSH Web listener alive.

The intermediate 0.1.6 package remains historical evidence, not the final
delivery identity. Rebuilding changed bytes under the already-installed 0.1.6
version correctly did not trigger Desktop replacement. The final delivery uses
0.1.7 rather than adding a same-version digest overwrite mechanism.

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
valid Runtime 0.1.7 v3 acceptance, and neither is misreported as a Tianwen product
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
