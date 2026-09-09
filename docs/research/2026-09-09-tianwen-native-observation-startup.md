# Tianwen native observation startup boundary

**Date:** 2026-09-09  
**Status:** design finding only; not implemented or deployed

## Decision

The installed DSH `0.1.1-rc.2` CLI provides a supported, narrow startup
boundary for replacing the two host services needed by native observation.
Tianwen Desktop can invoke the same native CLI twice: first to dump the Web
Profile's composed entry list, then to start Web with one generated `--patch`
overlay. This does not require a DSH boot fork, a second execution kernel, or a
rewrite of the user's Profile.

This route concerns only the host-plane `tools` and `pwsh-sandbox` service
rows. A native probe has separately established that a candidate agent can use
the public `ToolRuntime.register()` boundary together with
`ctx.fiber.runtime.callback` provenance. Native agent-preset tool rows therefore
do not need startup wrappers here. The ordinary default `standard` preset and
its tool schemas remain unchanged.

Nothing in this note says that the producer is wired today. In particular, the
current goal-first patch is not the normal Web startup path. This is a proposed
Desktop integration boundary only; it has not been deployed to Daily.

## Public CLI contract

The two supported command forms are:

```text
dsh web --dump-config
dsh web --patch <temporary-patch.yml> --host 127.0.0.1 --port 0 --no-open
```

`web` is the native alias for `--profile web`. Its `--patch` option is
repeatable. Launcher flags must be supplied to the `web` subcommand as shown;
parent `--profile`, `--patch`, or dump flags cannot be mixed with the `web`
subcommand form.

The effective patch order is:

1. Profile bundle patches, in `package.json` bundle order.
2. The Profile's `cordis.patch.yml`.
3. `$DSH_HOME/cordis.patch.yml`.
4. CLI `--patch` overlays, in argument order.

Later layers win. Actual boot subsequently adds DSH's programmatic shipped
agent-preset-root overlay and its telemetry switch. `--dump-config` does not
print those two programmatic overlays. They do not modify the `tools` or
`pwsh-sandbox` rows, so they do not invalidate this narrow service-row use, but
the dump must not be described as a complete snapshot of every boot-time fact.

## Dump semantics and boundaries

`--dump-config` composes the patch layers with the same public entry-patch
algorithm used by boot, without instantiating plugins or tools. It does not
evaluate `!!js` expressions. Platform gates, environment expressions, and
other dynamic values remain expressions in the rendered YAML. The dump is a
composed `EntryOptions` document, not a snapshot of Schemastery defaults or
runtime-resolved plugin configuration.

The generated overlay must therefore parse the dump with DSH's exported entry
list YAML schema, retain the exact unresolved fields for the two target rows,
and pass their configuration through the original native Config schemas. It
must preserve relevant `config`, `disabled`, `inject`, `isolate`, and
`intercept` values rather than silently filling defaults. The observer
subclasses keep the native `ToolRuntime` and PowerShell sandbox superclass
configuration, behavior, and service contracts unchanged; they add only the
observation boundary.

The dump is boot-free, but it is not strictly filesystem-read-only. Native DSH
rewrites the Profile's generated root `cordis.yml` to its canonical empty-root
anchor while preparing either a dump or a boot. It does not overwrite the
user-authored Profile or home `cordis.patch.yml`. Product and evidence wording
must call this a derived-file rewrite, not claim that the dump performs no
writes at all.

The dump may contain unrelated user configuration, including literal secrets
if a user placed them in a patch. Desktop must keep dump output in bounded
memory, extract only the two target rows, and never log, persist, or include the
full dump in diagnostics or receipts. The generated temporary patch must
contain no unrelated configuration and must never contain credentials.

## Protected replacement

The generated launch patch should:

- disable the existing `tools` row only when its id and expected native module
  name both match;
- disable the existing `pwsh-sandbox` row only when its id and expected native
  module name both match;
- insert uniquely named Tianwen observer-subclass rows carrying the exact
  retained fields from those native rows; and
- refuse observation preparation if either target is missing, duplicated, renamed,
  ambiguously composed, or cannot be represented losslessly.

Preparation refusal is not refusal to start ordinary Web: discard only the
owned overlay and retain stock launch, as described below. Do not change native
capability merely because the new evidence mode is unavailable.

The patch algorithm's `name` field on a non-insert patch is a match guard, not
a replacement name. A name mismatch produces a skipped-patch warning. Desktop
must treat that warning as a launch failure rather than starting a partially
adapted host. Inserted wrapper rows require new ids; they must not reuse the
disabled rows' ids.

Unsupported or custom compositions are not a reason to disable ordinary task
tools. If provenance or configuration is ambiguous, Desktop must retain the
stock composition and record that observation evidence is unavailable. It must
not invent defaults, silently substitute a wrapper, or remove `glob`, `grep`,
`skill`, `pwsh`, or other ordinary capabilities merely to make evidence
collection pass.

The dump inputs and launch must also be bound against time-of-check/time-of-use
drift. At minimum, retain and recheck hashes for the Profile manifest, relevant
bundle patch files, Profile patch, home patch when present, and the generated
overlay before starting the child. Runtime registration checks remain the
final proof that both observer subclasses actually won their service rows.

## Narrow Desktop integration

The existing `startDesktopWebHost()` in
`packages/tianwen-desktop-host/src/host.ts` already owns the native DSH child
process and its launch arguments. The smallest product route is:

1. Add a bounded helper beside the existing Desktop host code to invoke
   `dsh web --dump-config`, parse only the two target rows, and return a
   redacted in-memory description.
2. Add a small renderer for the one temporary launch patch and its exact
   target guards.
3. Have `startDesktopWebHost()` pass the temporary file through the public
   `web --patch` option, then delete it during normal or failed startup cleanup.
4. Package and export only the two observer-subclass entry points needed by
   that overlay.

This should remain in the existing Desktop startup and Runtime Bundle packaging
surfaces. It does not justify a generic launcher framework, a second Profile
manager, or changes to the native CLI.

## Focused verification

Tests should stay close to the existing Desktop host and packaging tests:

- exact CLI argument order for dump and Web launch;
- bundle/Profile/home/CLI overlay precedence for the two target rows;
- preservation of unresolved `!!js`, native config, disabled and dependency
  fields;
- rejection of missing, duplicate, renamed, truncated, or ambiguous targets;
- rejection on skipped-patch warnings and configuration drift between dump and
  launch;
- proof that unsupported custom composition starts stock Web without evidence
  rather than losing ordinary tools;
- proof that dump output and credentials never enter logs, receipts, or the
  generated patch;
- temporary-patch cleanup on launch failure, timeout, and child exit/shutdown;
- package checks for the two observer entry points; and
- unchanged ordinary `standard` preset, tool schemas, and native execution
  behavior when the observation route is admitted.

These tests establish startup wiring only. They do not by themselves prove a
native tool effect, a successful ordinary task, semantic answer quality, or a
Daily deployment.
