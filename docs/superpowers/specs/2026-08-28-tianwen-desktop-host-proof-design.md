# Tianwen Desktop host proof design

Date: 2026-08-28

Status: approved by the user's continuation of the corrected optional-Desktop direction

## 1. Goal

Build the smallest real Windows desktop proof that opens the existing DSH Web UI in a native
Electron window while continuing to use the already-installed exact Tianwen Runtime Bundle.

This proof answers one product question: can a DSH CLI user install Tianwen into the standard `web`
Profile and then open that same Runtime through a Tianwen-owned desktop shell?

## 2. Chosen approach

Use a new private workspace package, `@tianwen/desktop-host`, with two deliberately small layers:

1. a Node-only host controller validates one existing exact DSH root and its existing `web` Profile,
   starts `dsh web --host 127.0.0.1 --port 0 --no-open`, accepts only the emitted loopback URL, and
   owns shutdown of that child process tree;
2. an Electron main process creates one `BrowserWindow`, loads that URL, and closes the owned DSH
   process before the app exits.

The DSH child runs under an explicitly selected external Node `22.x` executable. Electron `43.4.0`
contains Node `24.x`, so the shell must not use Electron-as-Node to load DSH or its native dependency
closure. Electron renders the page only.

## 3. Alternatives rejected

- **Only run `dsh web` in the user's browser.** This proves Web composition but does not answer the
  desktop-product question.
- **Fork or embed a community DSH Desktop.** The reviewed projects carry a second DSH dependency
  closure, pnpm, native modules, patches, updater, and brand. That violates the one-Runtime boundary.
- **Build an installer, updater, signing flow, and custom renderer now.** None is needed to prove the
  host seam and each would enlarge the first failure surface.

## 4. Inputs and existing-product boundary

The proof accepts exactly three absolute paths:

- a compatible external Node executable;
- the existing exact `@deepseek-ai/dsh@0.1.1-rc.2` package root;
- the existing DSH home containing `profiles/web`.

The desktop host validates that:

- the DSH manifest is exact rc.2 and its `bin.dsh` is a real file inside the supplied package root;
- `profiles/web/package.json` exists;
- that Profile declares exactly one `@tianwen/runtime-bundle` bundle and dependency;
- the resolved `@tianwen/runtime-bundle@0.1.0` lives physically inside that Profile.

It does not create a Profile, run pnpm, add a Bundle, call the Tianwen installer, or modify Runtime
state. Profile initialization and Bundle installation remain DSH-owned prerequisite operations.

The existing managed `tianwen` Profile remains the headless product path. It is not silently changed
into a Web Profile.

## 5. Process and window lifecycle

The host controller launches the exact DSH JS entry with `shell: false`, `windowsHide: true`,
`DSH_HOME` fixed to the selected home, telemetry disabled, and the exact arguments:

```text
web --host 127.0.0.1 --port 0 --no-open
```

It collects bounded stdout/stderr, waits at most 120 seconds, parses the existing
`dsh web: http://127.0.0.1:<port>` line, and rejects every non-loopback or non-HTTP URL. Early exit,
timeout, output overflow, and duplicate shutdown produce deterministic errors.

Electron requests a single-instance lock, creates one default-secure `BrowserWindow`, denies new
renderer-created windows, and loads only the controller's loopback origin. Closing the last window
starts one idempotent host shutdown. On Windows, graceful child termination is followed by the native
`taskkill /T /F` fallback only if the owned tree remains alive.

No preload, IPC bridge, custom renderer, terminal, tray, updater, market, telemetry service, or
background daemon is added.

## 6. Verification

Default tests use fake child processes and a temporary exact Profile layout to prove:

- path/package containment and exact version checks;
- exact spawn program, arguments, environment, and `shell: false`;
- loopback ready parsing and rejection of remote/file/data URLs;
- early-exit, timeout, bounded-output, and idempotent shutdown behavior;
- zero installer, pnpm, deploy, Provider, or second-DSH action.

One separate opt-in Windows proof uses a fresh D-drive DSH home. The controller first uses the native
DSH plugin command to create the standard `web` Profile and add the already-built Tianwen Runtime
tarball. It then launches the real Electron app once. A test-only environment switch quits after the
page finishes loading so the controller can verify exit code `0`, HTTP readiness, port closure, and
no surviving owned DSH child.

The opt-in proof is product/runtime evidence, not a natural task or learning-efficacy run. It makes
no Provider request.

## 7. Explicit deferrals

- Electron Builder/NSIS, portable ZIP, signing, auto-update, publishing, and public branding;
- bundled Node distribution or automatic discovery of a user's Node installation;
- Profile picker, Profile creation UI, tray, terminal, notifications, and custom Tianwen pages;
- non-Windows support;
- external navigation policy beyond denying new windows in this proof;
- npm or GitHub publication.

These are added only after the real host proof succeeds and a later product slice needs them.
