# Tianwen v0.1 one-shot Profile lifecycle repair handoff

## Conclusion

The ordinary one-shot model-selection flow now completes its DSH Profile shutdown before the
process returns. This is a DSH/HMR shutdown-lifecycle repair, not receipt or security work.

Activity-03 remains historically consumed. Its DeepSeek model-use receipt persisted, but the
process ended with exit 13 before lifecycle. Offline recovery succeeded and controlled-lifecycle
invocation remained 0. Activity-01, Activity-02, and Activity-03 classifications remain unchanged.
This handoff does not claim real Provider success.

## Repair owner and proof

DSH owns Profile boot and shutdown. HMR watcher readiness owns the readiness promise for the watcher
it creates. The version-bound `@deepseek-ai/cordis-plugin-hmr` 1.0.16 repair gives that promise one
terminal outcome when disposal happens before watcher readiness; late watcher events and repeated
disposal are harmless. Tianwen does not add a second shutdown controller, retry, delay, or forced
exit.

The deterministic close-before-ready owner regression passes. The real Profile process regression
also passes the DeepSeek selection, confirming status, offline recovery, and final status sequence
with zero Provider requests. These tests prove process lifecycle and model-selection behavior only;
they do not prove a real Provider lifecycle succeeded.

## Prospective Activity boundary

Future state transition:

```text
model activation → fresh status confirms selection → first controlled-lifecycle invocation begins formal evaluation → offline recovery → final status
```

Model activation is setup and does not consume a formal Activity. The first future
controlled-lifecycle invocation consumes that Activity. A fresh official zero-request installed
proof still awaits exact-main CI; it is not a formal Activity and does not authorize Provider work.

## Authority and privacy

This handoff follows the approved
[one-shot Profile lifecycle repair design](../superpowers/specs/2026-08-24-tianwen-one-shot-profile-lifecycle-repair-design.md).
It records no credential values, raw diagnostics, private paths, packet contents, Session identities,
or formal task material.
