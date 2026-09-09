# Tianwen native observation startup boundary

**Date:** 2026-09-09  
**Status:** design finding only; not implemented or deployed

## Decision

The installed DSH `0.1.1-rc.2` provides a supported narrow startup boundary.
Use public app-boot path resolution and composeEntries, with a small bounded
source-discovery reader, to build raw entries in memory; invoke the existing
native Web CLI once with a narrow final --patch. This supersedes both the initial
dump subprocess and the intermediate direct-loadProfile proposal. It needs
neither a DSH boot fork nor a second execution kernel or profile manager.

The final read-only source check found that loadProfile fully reads/parses every
source before returning. A profile-ready precheck also cannot prevent its
missing-profile initialization if the file disappears before loadProfile reads
it. Therefore direct loadProfile cannot satisfy the intended pre-parse byte bound
and helper-no-profile-write guarantees. Use public resolveProfileDir and
resolveBundleDir, mirror only the small source-discovery loop, and retain native
composeEntries as the composition algorithm. Desktop's
host/port/no-open arguments and the native preset-root/telemetry overlays do not
modify the two target service rows. Compose bundle layers, profile patches and
home patches in that order; expressions remain unevaluated until native boot.

The discovery loop reads the existing web Profile package.json, resolves each
declared bundle in order using native installation-first anchors, reads that
bundle's package.json dsh.bundle.patch and patch bytes, then reads the Profile
patch and optional home patch. Each read is bounded by the remaining aggregate
1MiB budget plus one detection byte before JSON/YAML parsing. Do not use an
unbounded read after stat; the byte cap is not a generic YAML/JavaScript heap
bound. Native entryListSchema and list/object shape checks parse patches;
public composeEntries performs the unchanged patch algorithm. Do not initialize
or normalize profiles, call native unbounded readers, or evaluate expressions.
Bind/recheck all relevant manifests, patch bytes and absent optional sources
before launch, including installation-first resolution results. Unsupported or
changed sources use stock Web without claiming observation.

Installed app-boot source reviewed: readProfileManifest lines462-473,
resolveBundleDir535-542, loadProfile556-589, composeEntries592-596 and
loadOptionalPatches810-820 (lib/index.js in the installed0.1.1-rc.2 package).
composeEntries has no I/O. Importing public app-boot loads JavaScript helpers,
not profile plugins or a native addon; it has no public profile-only subpath.
Source check663e72 was read-only, with no new process/model/profile writes.

Normal production Web DOES hot-reload profile/home patches. The fixed final
overlay pins these two host service rows to the process's startup snapshot;
manual changes to them require Desktop restart. This is a disclosed bounded
compatibility tradeoff, not full HMR equivalence. The next launch recomposes
the new values or uses stock/no-evidence. Other rows/settings retain native
behavior. No extra watcher, automatic task interruption or scheduler is added.

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

The dump contract below was investigated as an alternative and explains native
serialization; the chosen product helper composes in memory and does not run
the first command. Only the final native Web launch remains.

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

The generated overlay must therefore serialize the raw composed entries with
DSH's exported entry-list YAML schema, retain the exact unresolved fields for the two target rows,
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

Raw composition may contain unrelated user configuration, including literal secrets
if a user placed them in a patch. Desktop must keep that data in bounded
memory, extract only the two target rows, and never log, persist, or include the
full configuration in diagnostics or receipts. The generated temporary patch must
contain no unrelated rows or unknown plugin config keys. Legitimate raw target
fields can themselves contain private paths, expressions or dependency values;
treat the entire narrow overlay as sensitive, with private access and bounded
lifetime. This is not generic secret detection and does not promise that arbitrary
secret text embedded in an otherwise legitimate field can be recognized.

The installed native config keys are closed: tools has mode and
maxParallelSubCalls (dsh-tools/lib/types/index.d.ts:449-476); sandbox config is
LocalConfig with cwd, timeoutMs, maxTimeoutMs, maxOutputBytes, maxSpillBytes,
graceMs and pwshPath (dsh-pwsh-sandbox/lib/types/index.d.ts:27 and
dsh-pwsh-local/lib/types/index.d.ts:39-59). Loader EntryOptions allows open config
and intercept data, but that does not expand the two plugin Config schemas.
Only known entry fields and native-schema-lossless metadata are adaptable;
unknown config/outer keys fall back to stock. Do not drop legitimate values,
evaluate expressions or use secret-field-name regexes to manufacture support.

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

The composition inputs and launch must also be bound against time-of-check/time-of-use
drift. At minimum, retain and recheck hashes for the Profile manifest, relevant
bundle patch files, Profile patch, home patch when present, and the generated
overlay before starting the child. Runtime registration checks remain the
final proof that both observer subclasses actually won their service rows.

## Narrow Desktop integration

The existing `startDesktopWebHost()` in
`packages/tianwen-desktop-host/src/host.ts` already owns the native DSH child
process and its launch arguments. The smallest product route is:

1. Add a bounded helper beside the existing Desktop host code to discover/read
   the native sources and call public native composition, select the two target rows, and return a
   non-sensitive in-memory description. No complete config stdout is produced.
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

- exact native composition order and final Web CLI argument order;
- bundle/Profile/home/CLI overlay precedence for the two target rows;
- preservation of unresolved `!!js`, native config, disabled and dependency
  fields;
- rejection of missing, duplicate, renamed, truncated, or ambiguous targets;
- rejection on skipped-patch warnings and configuration drift between composition and
  launch;
- proof that unsupported custom composition starts stock Web without evidence
  rather than losing ordinary tools;
- proof that full configuration and unrelated rows never enter the generated
  patch, and no selected sensitive values enter logs or receipts;
- temporary-patch cleanup on launch failure, timeout, and child exit/shutdown;
- package checks for the two observer entry points; and
- unchanged ordinary `standard` preset, tool schemas, and native execution
  behavior when the observation route is admitted;
- the two-row startup snapshot boundary and re-composition after restart.

The precise public YAML export is
`@deepseek-ai/cordis-plugin-include.entryListSchema`, not an app-boot export.
Root ran one small in-memory native-schema roundtrip:6 checks passed, expression
counter remained0, config/disabled/inject/isolate/intercept preserved, no artifacts
or models. Retained source: approved E consumer-tools-probe/raw-overlay-probe.mjs;
output b88e62. This is serialization evidence, not product startup acceptance.

These tests establish startup wiring only. They do not by themselves prove a
native tool effect, a successful ordinary task, semantic answer quality, or a
Daily deployment.
