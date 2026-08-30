# Tianwen Chinese Product UX Design

Date: 2026-08-29

Status: historical locale baseline; its v1 Task-authoring copy is superseded by
the 2026-08-30 Goal-first design

## 1. Decision

Tianwen Desktop and the Tianwen Learn Loop entry will use DSH's existing
`zh`/`en` locale preference. The screen displays exactly one language at a
time:

- Chinese locale: the Tianwen entry is `长期任务` and all Tianwen-owned visible
  controls, instructions, validation messages, and fallback errors are Chinese.
- English locale: the entry remains `Learn Loop` and the same surfaces are
  English.
- Changing Language in DSH Settings updates both DSH and Tianwen. Tianwen does
  not add a second language switch or show bilingual labels.

This is a product usability correction, not a new natural task or another
learning-efficacy evaluation.

## 2. Repository and upstream facts

Exact `@deepseek-ai/dsh@0.1.1-rc.2` already ships
`@deepseek-ai/dsh-client-locale`:

- the supported locale ids are `zh` and `en`;
- an explicit choice is stored as `locale.preference` in
  `$DSH_HOME/settings.yaml`;
- without an explicit choice, the browser language is used provisionally;
- the Settings Language row changes the active locale and registered client
  dictionaries re-render through the locale snapshot.

Tianwen currently bypasses that public service: its client bundle hard-codes
English copy and its client manifest does not inject the locale service.
Packaged Electron can also start Chromium in English even when Node detects a
Chinese Windows locale, so DSH's browser-derived fallback can begin in the
wrong language.

## 3. User experience

### 3.1 Language selection

On a Chinese Windows installation with no saved DSH preference, Tianwen
Desktop opens DSH Web in Chinese. An existing explicit DSH preference remains
authoritative: selecting English keeps the product English, and selecting
Chinese keeps it Chinese on later starts.

The ordinary `dsh web` path remains owned by the browser and DSH preference;
Tianwen does not force Chinese into another user's browser or Profile.

### 3.2 Tianwen entry and first-use guidance

In Chinese mode, the sidebar entry and overlay title are `长期任务`. The empty
list explains the real workflow in three short steps:

1. 在 DSH 中打开或创建一个项目工作区；
2. 创建一个长期目标，并按执行顺序填写任务；
3. 启动当前任务，天问会在独立 DSH 会话中继续执行。

The create form uses plain product terms such as `长期目标`, `每个任务最多执行轮数`,
`任务 1`, and `创建长期任务`. Detail actions use `开始任务`, `继续任务`, and
`打开会话`. Existing English behavior remains available when English is
selected.

This stage adds no tutorial wizard, tour framework, separate settings page, or
replacement chat interface. The empty-state explanation and contextual
workspace instruction are sufficient for the current product flow.

### 3.3 Desktop bootstrap copy

Tianwen-owned native selection dialogs and message boxes follow the detected
system language because they appear before DSH Settings can be opened. They do
not read or rewrite DSH's saved language preference. Diagnostic error details
may retain an upstream technical message, but the heading and required next
action are localized.

## 4. Architecture

The Runtime Bundle client adds the exact public locale client package as an
optional client dependency and injected service. It registers one Tianwen
namespace containing complete `zh` and `en` dictionaries, subscribes rendering
to the locale snapshot, and resolves all Tianwen-owned copy through the bound
translator. No translation state is persisted by Tianwen.

Before Electron becomes ready, Tianwen Desktop passes Node's detected system
locale to Chromium through its native language switch. This only fixes the
renderer's provisional language. After DSH loads, DSH's explicit Host-backed
preference still overrides it.

Desktop bootstrap copy uses one small locale-keyed copy table selected from
the same system-language decision. It introduces no localization library.

```text
Windows language -> Electron provisional browser language
                              |
                              v
DSH locale service <- $DSH_HOME/settings.yaml explicit preference
       |
       +-> DSH dictionaries
       +-> Tianwen zh/en dictionary -> one visible language
```

## 5. Failure and compatibility boundaries

- Missing or unavailable locale service is a composition error at client load,
  not a reason to silently render mixed-language Tianwen UI.
- Locale switching performs no model request, Session mutation, Goal mutation,
  Profile install, or process restart.
- Long-Goal schemas, RPC payloads, CLI output, stored objectives, task text,
  package names, and `tianwen.*` identifiers remain unchanged.
- User-authored objectives and upstream diagnostic details are never machine
  translated.
- Headless and ordinary CLI use remain independent of browser language.
- No DSH source fork or Tianwen-only copy of the Settings system is introduced.

## 6. Proportional verification

Verification is limited to the changed boundaries:

1. one Desktop unit test for Chinese/English system-locale selection and the
   packaged Chromium argument;
2. compiled client tests proving Chinese and English render separately and a
   locale switch updates Tianwen copy without an RPC or model request;
3. existing Learn Loop client behavior tests updated to use the active English
   locale where their assertions concern English labels;
4. Runtime Bundle archive/client-manifest checks, Desktop build, focused
   TypeScript tests, and one packaged Desktop smoke showing the Chinese entry;
5. the normal exact-main CI once after integration.

There is no new controlled Activity, paid Provider call, natural task, or broad
historical acceptance replay.

## 7. Completion criteria

The stage is complete when:

1. a Chinese Windows user with no saved locale opens Tianwen Desktop in Chinese;
2. DSH Settings can switch between Chinese and English and Tianwen follows
   immediately, never showing both languages together;
3. the Chinese empty state tells a first-time user how to reach and run the
   first task;
4. ordinary DSH Web, Desktop, CLI, Goal, Session, and process-lifecycle
   boundaries remain unchanged;
5. focused local checks and exact-main CI pass.
