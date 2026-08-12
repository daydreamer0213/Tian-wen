# Sealed evaluator Windows deployment

The sealed evaluator must run as a Windows account different from the account
running Tian-wen. If isolation checks fail, it exits without a receipt and
promotion remains blocked.

`TIANWEN_EVAL_PRIVATE_KEY` is now a path to a private-key file. Never put PEM
or base64 private-key material directly in that environment variable.

## 1. Create the two-account boundary

Create a dedicated local or domain evaluator account, for example
`TianwenEvaluator`. Do not run the worker as the Tian-wen runtime account.
Creating accounts is an administrator decision and is not automated by Tian-wen.

Put `cases.json` in `D:\DevData\tianwen-evaluator\sealed` and the Ed25519
private key in `D:\DevData\tianwen-evaluator\evaluator-private.key`.

## 2. Remove inherited access and grant only the evaluator and SYSTEM

From elevated PowerShell, replace `TianwenEvaluator` with the real evaluator
account. These commands change only the evaluator data location; Tian-wen never
changes production ACLs automatically.

```powershell
icacls D:\DevData\tianwen-evaluator\sealed /inheritance:r
icacls D:\DevData\tianwen-evaluator\sealed /grant:r "TianwenEvaluator:(OI)(CI)(RX)"
icacls D:\DevData\tianwen-evaluator\sealed /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)(F)"
icacls D:\DevData\tianwen-evaluator\sealed\cases.json /inheritance:r
icacls D:\DevData\tianwen-evaluator\sealed\cases.json /grant:r "TianwenEvaluator:(R)"
icacls D:\DevData\tianwen-evaluator\sealed\cases.json /grant:r "NT AUTHORITY\SYSTEM:(F)"
icacls D:\DevData\tianwen-evaluator\evaluator-private.key /inheritance:r
icacls D:\DevData\tianwen-evaluator\evaluator-private.key /grant:r "TianwenEvaluator:(R)"
icacls D:\DevData\tianwen-evaluator\evaluator-private.key /grant:r "NT AUTHORITY\SYSTEM:(F)"
```

The final ACL for every protected path may contain only the evaluator account
and `NT AUTHORITY\SYSTEM`. Do not grant `Administrators`, `Creator Owner`, the
runtime account, or any group access. SYSTEM is permitted only for required OS
maintenance and does not count as evaluator access. Do not add inheritance:
any `(I)` entry makes the worker fail closed. The worker also rejects DENY,
unknown, malformed, and localized-but-unrecognized principals, so it does not
depend on guessing localized Windows group names.

## 3. Verify from both accounts

Sign in as `TianwenEvaluator` and run:

```powershell
whoami
icacls D:\DevData\tianwen-evaluator\sealed
icacls D:\DevData\tianwen-evaluator\sealed\cases.json
icacls D:\DevData\tianwen-evaluator\evaluator-private.key
Get-Content D:\DevData\tianwen-evaluator\sealed\cases.json -TotalCount 1
```

The `whoami` account needs `RX` on `sealed` and `R` on both files. The output
must show no `(I)` entries and no principals other than the evaluator and
SYSTEM. Then sign in as `TianwenRuntime`, run the same `whoami` and `icacls`
commands, and attempt to read each file. Reads must return `Access is denied.`

## 4. Start the evaluator

Set these variables only in the evaluator account's scheduled task or service:

```powershell
$env:TIANWEN_SEALED_DATASET_DIR = 'D:\DevData\tianwen-evaluator\sealed'
$env:TIANWEN_EVAL_PRIVATE_KEY = 'D:\DevData\tianwen-evaluator\evaluator-private.key'
$env:TIANWEN_RUNTIME_ACCOUNT = 'TianwenRuntime'
python evaluator\run_sealed_evaluator.py <champion.snapshot> <challenger.snapshot> <protocol.json> <challenge> <receipt.json>
```

The worker calls `whoami` and `icacls` before reading `cases.json` or the
private key. All three variables are required for a Windows run. Missing
variables, account overlap, unsafe paths, inherited, DENY, unexpected, or
unparseable ACL output, or an ACL query failure produces a nonzero exit and no
receipt.
