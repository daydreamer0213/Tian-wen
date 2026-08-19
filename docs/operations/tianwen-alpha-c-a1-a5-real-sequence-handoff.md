# Tianwen Alpha-C A1–A5 real-sequence handoff

## Authority and scope

- Canonical base: local `main` at `860f45c29b530b280834d1903ceb111aa41ce232`.
- This document closes the real-sampling/no-candidate substage. The five one-shot stage branches, roots, receipts, databases, and retained audit containers remain evidence and are not merged, replayed, rewritten, or broadly cleaned up.
- No new paid sample is authorized by this handoff. The remaining Alpha-C budget is preserved for a future genuine trigger.

## Verified sequence

| Task | Evidence stage | Final receipt SHA-256 | SQLite SHA-256 | Observed tokens | Outcome | Triage | Case | Candidate |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| A1 | `c73485135a747809b82ec510fd4f6a1e717e861b` | `55cc4e97115061f4d81c5c28de254962e577da8871f92f182475ebfc6a41e835` | `ccb26569d3cb5a9fd5278fb3551b538eb92f44bdae3f981a70a00137cf994162` | 14,881 | `verified_success` | `observe` | `None` | `None` |
| A2 | `ecbf832eca9c39de67e6f58391e7f4a2d4ea9c18` | `fd0ed0248eddccf6f36d7302fde5ef2a104d85f67ecf9c250c674dbb897bd856` | `19c007490593f922711aa778e4a48b7fb71f32a8c3267e9abe900b407e420197` | 14,494 | `verified_success` | `observe` | `None` | `None` |
| A3 | `b46961a26ebfe4f7ea4423f7f7df83f9c17ec14f` | `27548d94e1dfe878a7e2a54520fdcc840acdc3fe454d3e872c059ca0e43f27d3` | `294e6a523be43d078154da87ac5962ac0e3d7dc5e76db16288344acc8074b6f4` | 17,095 | `verified_success` | `observe` | `None` | `None` |
| A4 | `c316a6e7551b2e9945fab97d1a59a37f3d3f7f6e` | `88411442d38aea2b1d9fbe4796dfd5d6e35c10d376874ea6906212804cb0af30` | `d367e62116eab5063598773341ef16a51327ac41905ea201466df07999085047` | 18,438 | `verified_success` | `observe` | `None` | `None` |
| A5 | `9e209334798571e838de8558a1af9acda1eee6aa` | `b2272a8b2c55db5aa0b8988fb73a9d1079cdc8524b98f1681f71efde5c3c3799` | `4ab55a6536715feaee253e912de135114bb87bd0801d2038460afa31350d0e79` | 31,570 | `verified_success` | `observe` | `None` | `None` |

The sequence covers a simple implementation, a small feature, a frozen-source compatibility change, a behavior-preserving local modification, and a two-round feedback task. Each completed with durable real-model evidence and produced one successful observation without a learning gap.

## Cost and stage status

- The clean non-thinking A1–A5 sequence used 96,478 observed tokens. At the governance audit rate of CNY 27 per million tokens, its historical conservative projection is CNY 2.604906.
- CNY 15.510501 used and CNY 4.489499 remaining are the former worst-case governance projection. They are not provider billing facts and no longer govern the current budget balance or a future execution decision.
- Billing authority correction: on 2026-08-19, the user checked the provider billing record and explicitly confirmed that this project and stage had actually incurred CNY 0.48. Against the standing CNY 20 authorization, the current actual authorized balance is CNY 19.52.
- The repository contains no billing screenshot or export for this correction. Its evidence type is explicit user billing confirmation; no invoice digest is claimed. A formal billing reference may be appended if one is imported later, but no CSV or screenshot is currently required.
- The real-sampling/no-candidate substage is complete: all five tasks ended as `verified_success` / `observe`, with no `Case` and no `Candidate`.
- Full Alpha-C is incomplete. No natural evidence yet supports the path from a genuine `Gap` through repeated `Case`, Attribution, Lesson, and Candidate.

## Event-driven next entry

The next Alpha-C entry must be triggered by either a repeated, attributable failure from real product use or an explicit user correction. It should reuse the existing Learning Intake contract to establish a Case first; Attribution, Lesson, and Candidate work must then occur in a separate bounded slice.

Ordinary successful runs, model self-reflection, and deliberately constructed failures must not be converted into learning Signals. Without a Candidate, Alpha-D remains locked: there is nothing to protect-evaluate, promote, shadow, or migrate.

The consumed roots and retained audit containers remain immutable evidence. This stage now waits for a genuine event-driven trigger; it does not spend the CNY 19.52 actual authorized balance merely because funds remain.
