# Tianwen Model Configuration Design

**Date:** 2026-08-16

**Status:** Approved by the architecture controller under the user's standing
authorization to continue with the recommended minimal design.

## 1. Outcome

Add two installed commands:

```powershell
tianwen model status --data-dir D:\DevData\tianwen
tianwen model use --model deepseek-v4-pro --data-dir D:\DevData\tianwen
```

`status` reports the current default model and whether its credential reference
is configured. `use` saves one explicit DeepSeek model selection through DSH's
public settings service. Neither command sends a model request.

The installer's offline smoke model remains the composition default. A saved
selection overrides it only after the user runs `model use`.

## 2. Reused DSH authority

Tianwen does not create a model adapter, settings store or credential vault.
It reuses the public `0.1.0-rc.6` services already mounted by
`@deepseek-ai/dsh-base`:

- `AgentDefaultModelConfig.currentSelection()` and `saveSelection()` for the
  default model;
- `ctx.llm.listModels('deepseek-official')` for the advisory DeepSeek catalog;
- `ctx.credentials.describe(credentialRef('DEEPSEEK_API_KEY'))` for safe
  credential status;
- `dsh-settings-file` and `dsh-credentials-local` for durable storage owned by
  DSH.

The DeepSeek adapter already owns provider route `deepseek-official` and
publishes `deepseek-v4-flash` and `deepseek-v4-pro`. Tianwen accepts only those
two first-version model ids. Supporting arbitrary providers or catalog ids is
not needed yet.

## 3. Credential contract

This phase never accepts a literal API key in argv, JSON, a receipt or Tianwen
state. The existing DSH credential provider resolves `DEEPSEEK_API_KEY` per
request from its normal layers: inherited environment, managed
`$DSH_HOME/.credentials.yaml`, project `.env`, then user `.env`.

`model status` and `model use` expose only:

- credential reference `DEEPSEEK_API_KEY`;
- whether it is configured;
- provider-defined source when configured;
- whether the managed source is writable.

The value is never read by Tianwen code. A future DSH Models UI or a separate
explicit stdin command may write the managed store; neither belongs in this
phase. Users can already supply the environment variable without changing the
repository or persisted Goal/Session data.

## 4. Command contract

```text
tianwen model status --data-dir ABSOLUTE_PATH [--json]
tianwen model use --model deepseek-v4-flash|deepseek-v4-pro
                  --data-dir ABSOLUTE_PATH [--json]
```

- `model` requires exactly one subcommand, `status` or `use`;
- `--data-dir` must be absolute;
- `status` rejects `--model`;
- `use` requires one supported model id;
- provider and credential reference are fixed by Tianwen;
- unknown flags and unrelated Goal/create flags are usage errors.

Usage errors return 2. Missing/incompatible installation, Profile launch,
settings persistence or service failures return 1. Success returns 0.

## 5. Runner and persistence

The CLI launches the installed DSH Profile through the same fixed executable
resolver used by create/resume. A model-only patch disables ordinary headless
startup and the Goal round driver, then inserts one Tianwen model runner.

For `status`, the runner only reads the current selection, catalog and safe
credential description. For `use`, it first proves the requested model exists
in the current `deepseek-official` catalog, calls `saveSelection()`, and reads
the resulting selection back. DSH owns the atomic `settings.yaml` write.

No Agent or Session is created. No Goal, Evidence, Evolution or Champion state
is read or changed. The receipt always records `modelRequestsDelta: 0`.

## 6. Receipt

JSON output uses `tianwen.model-config.v1`:

```text
schemaVersion
operation: status | use
selection: provider, model
catalog: provider, availableModels, selectedModelAvailable
credential: reference, configured, source?, writable
modelRequestsDelta: 0
```

Human output states the selected model, whether the credential is configured,
and that no model request was sent. It never prints secret values, settings
contents or environment contents.

## 7. Minimal acceptance matrix

1. Fresh installed Profile reports the fixed offline smoke selection and an
   unconfigured or configured DeepSeek credential without a model request.
2. `model use --model deepseek-v4-pro` persists the selection in DSH settings.
3. A fresh process reports the saved V4 Pro selection.
4. `model use --model deepseek-v4-flash` can replace it through the same seam.
5. Unsupported provider/model input fails before any settings write.
6. Receipts and stderr never contain a fake-key sentinel used by tests.
7. Goal, Session, Evidence, Evolution and Champion authority bytes remain
   unchanged.
8. Existing install/create/list/status/resume behavior remains unchanged.

## 8. Non-goals

- no live or paid model request and no key validation against the network;
- no API key CLI argument, prompt, stdin reader or Tianwen secret file;
- no arbitrary provider registry, custom endpoint editor or model discovery
  framework;
- no desktop Models page, daemon, watcher, scheduler or database;
- no Goal execution, automatic resume, Python removal or Runtime cutover.

## 9. Retained risks

- A configured credential can still be invalid or lack balance; only a later
  explicitly authorized live request can prove provider acceptance.
- Environment-supplied credentials must be present in each launching process
  unless the user stores them through DSH's managed credential surface.
- DSH remains pinned to Developer Preview `0.1.0-rc.6`; its model ids and
  settings schema must be rechecked before an upgrade.
