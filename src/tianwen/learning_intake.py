"""Privacy-safe projections and strict triage for Alpha-C learning intake."""

from __future__ import annotations

from typing import Literal, cast

from pydantic import model_validator

from tianwen.alpha import TrialManifest, TrialResult
from tianwen.domain import CaseRecord, EvidenceRecord, FrozenModel, LessonRecord, LoopKind, LoopRecord, content_digest
from tianwen.learning import AttributionRecord, LearningEngine, LearningSignal, LearningTicket
from tianwen.memory import MemoryFirewall, MemoryProposal, MemoryStore
from tianwen.store import StateConflict, StateStore

OutcomeKind = Literal[
    "verified_failure",
    "verified_success",
    "explicit_user_correction",
    "persistent_user_preference",
    "one_off_user_choice",
    "runtime_failure",
    "capability_discovery",
    "model_self_assessment",
    "ordinary_low_score",
]
UserFeedbackOutcomeKind = Literal["explicit_user_correction", "persistent_user_preference", "one_off_user_choice"]
NonLearningOutcomeKind = Literal[
    "runtime_failure", "capability_discovery", "model_self_assessment", "ordinary_low_score"
]


def _nonempty(value: str, label: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{label} must be non-empty")
    return value


def _ids(values: tuple[str, ...], label: str) -> tuple[str, ...]:
    return tuple(sorted({_nonempty(value, label) for value in values}))


class OutcomeObservation(FrozenModel):
    outcome_id: str
    source_kind: Literal["trial_verifier", "user_feedback", "operational"]
    source_id: str
    source_digest: str
    outcome_kind: OutcomeKind
    capability_scope: str
    task_id: str | None = None
    goal_id: str | None = None
    run_id: str | None = None
    trial_id: str | None = None
    problem_fingerprint: str | None = None
    evidence_ids: tuple[str, ...] = ()
    authority_id: str | None = None

    @model_validator(mode="after")
    def validate_observation(self) -> OutcomeObservation:
        updates: dict[str, object] = {
            "outcome_id": _nonempty(self.outcome_id, "outcome id"),
            "source_id": _nonempty(self.source_id, "source id"),
            "source_digest": _nonempty(self.source_digest, "source digest"),
            "capability_scope": _nonempty(self.capability_scope, "capability scope"),
            "evidence_ids": _ids(self.evidence_ids, "evidence id"),
        }
        if self.problem_fingerprint is not None:
            updates["problem_fingerprint"] = _nonempty(self.problem_fingerprint, "problem fingerprint")
        if self.source_kind in {"trial_verifier", "user_feedback"} and not self.trial_id:
            raise ValueError("trial observations require a trial id")
        if self.outcome_kind == "verified_failure" and not self.problem_fingerprint:
            raise ValueError("verified failures require a problem fingerprint")
        for field, value in updates.items():
            object.__setattr__(self, field, value)
        return self


class OutcomeSourceAuthority(FrozenModel):
    """Append-only proof that an observation passed a trusted source projector."""

    authority_id: str
    source_kind: Literal["trial_verifier", "user_feedback", "operational"]
    source_id: str
    source_digest: str
    outcome_kind: OutcomeKind
    capability_scope: str
    task_id: str | None = None
    goal_id: str | None = None
    run_id: str | None = None
    trial_id: str | None = None
    problem_fingerprint: str | None = None
    evidence_ids: tuple[str, ...] = ()

    @model_validator(mode="after")
    def validate_authority(self) -> OutcomeSourceAuthority:
        values: dict[str, object] = {
            "authority_id": _nonempty(self.authority_id, "authority id"),
            "source_id": _nonempty(self.source_id, "source id"),
            "source_digest": _nonempty(self.source_digest, "source digest"),
            "capability_scope": _nonempty(self.capability_scope, "capability scope"),
            "evidence_ids": _ids(self.evidence_ids, "evidence id"),
        }
        if self.problem_fingerprint is not None:
            values["problem_fingerprint"] = _nonempty(self.problem_fingerprint, "problem fingerprint")
        for field, value in values.items():
            object.__setattr__(self, field, value)
        return self


class ObservedGap(FrozenModel):
    gap_id: str
    problem_fingerprint: str
    capability_scope: str
    outcome_ids: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    recurrence: int

    @model_validator(mode="after")
    def validate_gap(self) -> ObservedGap:
        outcomes = _ids(self.outcome_ids, "outcome id")
        if not outcomes or self.recurrence < 1:
            raise ValueError("observed gaps require outcomes and positive recurrence")
        for field, value in {
            "gap_id": _nonempty(self.gap_id, "gap id"),
            "problem_fingerprint": _nonempty(self.problem_fingerprint, "problem fingerprint"),
            "capability_scope": _nonempty(self.capability_scope, "capability scope"),
            "outcome_ids": outcomes,
            "evidence_ids": _ids(self.evidence_ids, "evidence id"),
        }.items():
            object.__setattr__(self, field, value)
        return self


class LearningTriageReceipt(FrozenModel):
    triage_id: str
    gap_id: str | None
    outcome_ids: tuple[str, ...]
    disposition: Literal["observe", "current_fix", "preference_binding", "learning_case"]
    reason: str
    signal_id: str | None = None
    ticket_id: str | None = None
    case_id: str | None = None
    memory_id: str | None = None
    candidate_version_id: None = None

    @model_validator(mode="after")
    def validate_receipt(self) -> LearningTriageReceipt:
        outcome_ids = _ids(self.outcome_ids, "outcome id")
        if not outcome_ids:
            raise ValueError("triage requires outcomes")
        _nonempty(self.triage_id, "triage id")
        _nonempty(self.reason, "triage reason")
        chain = (self.signal_id, self.ticket_id, self.case_id)
        if self.disposition == "learning_case":
            if not self.gap_id or any(value is None for value in chain) or self.memory_id is not None:
                raise ValueError("learning cases require a gap, signal, ticket, and case")
        elif self.gap_id is not None or any(value is not None for value in chain):
            raise ValueError("only learning cases may include governed learning ids")
        if self.disposition == "preference_binding":
            if self.memory_id is None:
                raise ValueError("preference binding requires memory")
        elif self.memory_id is not None:
            raise ValueError("only preference binding may include memory")
        object.__setattr__(self, "outcome_ids", outcome_ids)
        return self


class LearningConclusionReceipt(FrozenModel):
    conclusion_id: str
    triage_id: str
    ticket_id: str
    case_id: str
    attribution_id: str
    outcome: Literal["no_lesson", "conditional_lesson"]
    stop_reason: str | None = None
    lesson_id: str | None = None
    candidate_version_id: None = None

    @model_validator(mode="after")
    def validate_conclusion(self) -> LearningConclusionReceipt:
        for value, label in (
            (self.conclusion_id, "conclusion id"),
            (self.triage_id, "triage id"),
            (self.ticket_id, "ticket id"),
            (self.case_id, "case id"),
            (self.attribution_id, "attribution id"),
        ):
            _nonempty(value, label)
        if self.outcome == "no_lesson":
            if self.stop_reason is None or not self.stop_reason.strip() or self.lesson_id is not None:
                raise ValueError("no-lesson conclusions require a stop reason and no lesson")
        elif self.lesson_id is None or not self.lesson_id.strip() or self.stop_reason is not None:
            raise ValueError("conditional lessons require a lesson and no stop reason")
        return self


class LearningIntake:
    def __init__(self, store: StateStore | LearningEngine, engine: LearningEngine | None = None) -> None:
        if isinstance(store, LearningEngine):
            if engine is not None:
                raise TypeError("an engine already owns its state store")
            self.engine, self.store = store, store.store
        else:
            if engine is None or engine.store is not store:
                raise ValueError("LearningIntake requires an engine for this state store")
            self.store, self.engine = store, engine

    @staticmethod
    def _scope(result: TrialResult) -> str:
        return f"repo_task_skill/{result.champion_version_id}/task/{result.task_id}@{result.task_version}"

    def _record_authority(
        self,
        *,
        source_kind: Literal["trial_verifier", "user_feedback", "operational"],
        source_id: str,
        source_digest: str,
        outcome_kind: OutcomeKind,
        capability_scope: str,
        task_id: str | None = None,
        goal_id: str | None = None,
        run_id: str | None = None,
        trial_id: str | None = None,
        problem_fingerprint: str | None = None,
        evidence_ids: tuple[str, ...] = (),
    ) -> OutcomeSourceAuthority:
        values = {
            "source_kind": source_kind,
            "source_id": source_id,
            "source_digest": source_digest,
            "outcome_kind": outcome_kind,
            "capability_scope": capability_scope,
            "task_id": task_id,
            "goal_id": goal_id,
            "run_id": run_id,
            "trial_id": trial_id,
            "problem_fingerprint": problem_fingerprint,
            "evidence_ids": _ids(evidence_ids, "evidence id"),
        }
        authority = OutcomeSourceAuthority(
            authority_id=content_digest({"outcome_source_authority": values}), **values
        )
        self.store.put_immutable_object(
            "outcome_source_authority", authority.authority_id, authority.trial_id, "recorded", authority
        )
        return authority

    @staticmethod
    def _matches_authority(outcome: OutcomeObservation, authority: OutcomeSourceAuthority) -> bool:
        return (
            authority.source_kind,
            authority.source_id,
            authority.source_digest,
            authority.outcome_kind,
            authority.capability_scope,
            authority.task_id,
            authority.goal_id,
            authority.run_id,
            authority.trial_id,
            authority.problem_fingerprint,
            authority.evidence_ids,
        ) == (
            outcome.source_kind,
            outcome.source_id,
            outcome.source_digest,
            outcome.outcome_kind,
            outcome.capability_scope,
            outcome.task_id,
            outcome.goal_id,
            outcome.run_id,
            outcome.trial_id,
            outcome.problem_fingerprint,
            outcome.evidence_ids,
        )

    @staticmethod
    def _validated_gap_outcomes(
        store: StateStore, triage: LearningTriageReceipt, gap: ObservedGap
    ) -> tuple[OutcomeObservation, ...]:
        if triage.outcome_ids != gap.outcome_ids:
            raise StateConflict("triage outcomes must exactly bind the persisted gap")
        outcomes = tuple(
            store.get_object("outcome_observation", outcome_id, OutcomeObservation) for outcome_id in gap.outcome_ids
        )
        for outcome in outcomes:
            if outcome.authority_id is None:
                raise StateConflict("governed outcomes require source authority")
            authority = store.get_object("outcome_source_authority", outcome.authority_id, OutcomeSourceAuthority)
            if not LearningIntake._matches_authority(outcome, authority):
                raise StateConflict("governed outcome does not match its source authority")
        return outcomes

    @staticmethod
    def _fingerprint(result: TrialResult, manifest: TrialManifest, scope: str) -> str:
        return content_digest(
            {
                "schema": "tianwen.alpha_c.outcome_fingerprint.v1",
                "capability_scope": scope,
                "model_id": result.model_id,
                "task_bundle_digest": manifest.task_bundle_digest,
                "model_input_digest": manifest.model_input_digest,
                "baseline_tree_digest": result.baseline_tree_digest,
                "verifier_digest": result.verifier_digest,
                "verdict": result.verdict,
                "failure_categories": tuple(sorted(set(result.failure_categories))),
                "execution_status": result.execution_status,
                "verification_status": result.verification_status,
                "boundary_status": result.boundary_status,
            }
        )

    @staticmethod
    def _source_digest(result: TrialResult) -> str:
        """Bind durable verdict fields only; do not retain workspace/diff/prompt data."""
        return content_digest(
            {
                "schema": result.schema_version,
                "trial_id": result.trial_id,
                "manifest": result.trial_manifest_digest,
                "goal_id": result.goal_id,
                "run_ids": result.run_ids,
                "task_id": result.task_id,
                "task_version": result.task_version,
                "model_id": result.model_id,
                "champion_version_id": result.champion_version_id,
                "champion_digest": result.champion_digest,
                "baseline_tree_digest": result.baseline_tree_digest,
                "final_tree_digest": result.final_tree_digest,
                "verifier_digest": result.verifier_digest,
                "verdict": result.verdict,
                "failure_categories": tuple(sorted(set(result.failure_categories))),
                "execution_status": result.execution_status,
                "verification_status": result.verification_status,
                "boundary_status": result.boundary_status,
                "evidence_ids": _ids(result.evidence_ids, "evidence id"),
                "usage": result.usage.model_dump(mode="json"),
            }
        )

    def _copy_evidence(self, source: StateStore, evidence_ids: tuple[str, ...]) -> tuple[EvidenceRecord, ...]:
        records = tuple(
            source.get_object("evidence", item, EvidenceRecord) for item in _ids(evidence_ids, "evidence id")
        )
        for record in records:
            self.store.put_immutable_object("evidence", record.evidence_id, record.run_id, "recorded", record)
        return records

    def _validate_trial(
        self, result: TrialResult, source: StateStore
    ) -> tuple[TrialResult, TrialManifest, tuple[EvidenceRecord, ...]]:
        supplied = TrialResult.model_validate(result)
        durable = source.get_object("alpha_trial_result", supplied.trial_id, TrialResult)
        if durable != supplied:
            raise StateConflict("trial result does not exactly match durable receipt")
        manifest = source.get_object("alpha_trial_manifest", durable.trial_id, TrialManifest)
        if durable.trial_manifest_digest != content_digest(manifest):
            raise StateConflict("trial result manifest binding does not match")
        if (
            durable.trial_id != manifest.trial_id
            or durable.task_id != manifest.task_id
            or durable.task_version != manifest.task_version
            or durable.model_id != manifest.model_id
            or durable.champion_version_id != manifest.champion_version_id
            or durable.champion_digest != manifest.champion_digest
            or durable.verifier_digest != manifest.verifier_snapshot.get("digest")
        ):
            raise StateConflict("trial result and manifest bindings do not match")
        evidence = tuple(
            source.get_object("evidence", item, EvidenceRecord) for item in _ids(durable.evidence_ids, "evidence id")
        )
        final_verifier_records = tuple(
            item
            for item in evidence
            if item.evidence_type == "alpha_final_verification"
            and item.purpose == "alpha_final_verification"
            and item.source_class == "docker_verifier"
        )
        final_run_id = (
            durable.run_ids[-1]
            if durable.run_ids
            else durable.exploration_run_ids[-1]
            if durable.exploration_run_ids
            else f"alpha:{durable.trial_id}:settlement"
        )
        if not final_verifier_records or any(
            item.scope != f"trial:{durable.trial_id}"
            or item.run_id != final_run_id
            for item in final_verifier_records
        ):
            raise StateConflict("trial outcome requires final-verifier evidence bound to its trial and run")
        for item in evidence:
            self.store.put_immutable_object("evidence", item.evidence_id, item.run_id, "recorded", item)
        return durable, manifest, evidence

    def record_trial_outcome(self, result: TrialResult, *, trial_store: StateStore) -> OutcomeObservation:
        durable, manifest, evidence = self._validate_trial(result, trial_store)
        scope = self._scope(durable)
        fingerprint = self._fingerprint(durable, manifest, scope)
        qualifying = (
            durable.execution_status == "completed"
            and durable.verification_status == "completed"
            and durable.boundary_status == "passed"
            and durable.verdict == "not_met"
            and bool(durable.failure_categories)
        )
        kind = cast(OutcomeKind, "verified_failure" if qualifying else "verified_success")
        digest = self._source_digest(durable)
        authority = self._record_authority(
            source_kind="trial_verifier",
            source_id=durable.trial_id,
            source_digest=digest,
            outcome_kind=kind,
            capability_scope=scope,
            task_id=durable.task_id,
            goal_id=durable.goal_id,
            run_id=next(item.run_id for item in evidence if item.evidence_type == "alpha_final_verification"),
            trial_id=durable.trial_id,
            problem_fingerprint=fingerprint,
            evidence_ids=tuple(item.evidence_id for item in evidence),
        )
        observation = OutcomeObservation(
            outcome_id=content_digest({"trial_outcome": digest, "kind": kind}),
            source_kind="trial_verifier",
            source_id=durable.trial_id,
            source_digest=digest,
            outcome_kind=kind,
            capability_scope=scope,
            task_id=durable.task_id,
            goal_id=durable.goal_id,
            run_id=authority.run_id,
            trial_id=durable.trial_id,
            problem_fingerprint=fingerprint,
            evidence_ids=tuple(item.evidence_id for item in evidence),
            authority_id=authority.authority_id,
        )
        self.store.put_immutable_object(
            "outcome_observation", observation.outcome_id, durable.trial_id, "recorded", observation
        )
        return observation

    def record_user_feedback(
        self,
        *,
        feedback_id: str,
        feedback_digest: str,
        kind: UserFeedbackOutcomeKind,
        trial_id: str,
        trial_store: StateStore,
        evidence_ids: tuple[str, ...] = (),
    ) -> OutcomeObservation:
        result = trial_store.get_object("alpha_trial_result", trial_id, TrialResult)
        durable, _manifest, _trial_evidence = self._validate_trial(result, trial_store)
        evidence = self._copy_evidence(trial_store, evidence_ids)
        if kind == "explicit_user_correction" and not any(
            item.source_class == "user" and item.scope == f"trial:{trial_id}" and feedback_id in item.provenance_ids
            for item in evidence
        ):
            raise StateConflict("explicit correction requires matching persisted user evidence")
        scope = self._scope(durable)
        feedback_id, feedback_digest = (
            _nonempty(feedback_id, "feedback id"),
            _nonempty(feedback_digest, "feedback digest"),
        )
        authority = self._record_authority(
            source_kind="user_feedback",
            source_id=feedback_id,
            source_digest=feedback_digest,
            outcome_kind=kind,
            capability_scope=scope,
            task_id=durable.task_id,
            goal_id=durable.goal_id,
            trial_id=trial_id,
            problem_fingerprint=content_digest({"feedback_digest": feedback_digest, "capability_scope": scope}),
            evidence_ids=tuple(item.evidence_id for item in evidence),
        )
        observation = OutcomeObservation(
            outcome_id=content_digest(
                {"feedback": feedback_id, "digest": feedback_digest, "kind": kind, "scope": scope}
            ),
            source_kind="user_feedback",
            source_id=feedback_id,
            source_digest=feedback_digest,
            outcome_kind=kind,
            capability_scope=scope,
            task_id=durable.task_id,
            goal_id=durable.goal_id,
            trial_id=trial_id,
            problem_fingerprint=authority.problem_fingerprint,
            evidence_ids=tuple(item.evidence_id for item in evidence),
            authority_id=authority.authority_id,
        )
        self.store.put_immutable_object(
            "outcome_observation", observation.outcome_id, trial_id, "recorded", observation
        )
        return observation

    def record_non_learning_outcome(
        self,
        *,
        source_id: str,
        source_digest: str,
        kind: NonLearningOutcomeKind,
        capability_scope: str,
        evidence_ids: tuple[str, ...] = (),
    ) -> OutcomeObservation:
        evidence_ids = _ids(evidence_ids, "evidence id")
        for evidence_id in evidence_ids:
            self.store.get_object("evidence", evidence_id, EvidenceRecord)
        authority = self._record_authority(
            source_kind="operational",
            source_id=source_id,
            source_digest=source_digest,
            outcome_kind=kind,
            capability_scope=capability_scope,
            evidence_ids=evidence_ids,
        )
        observation = OutcomeObservation(
            outcome_id=content_digest(
                {"source": source_id, "digest": source_digest, "kind": kind, "scope": capability_scope}
            ),
            source_kind="operational",
            source_id=_nonempty(source_id, "source id"),
            source_digest=_nonempty(source_digest, "source digest"),
            outcome_kind=kind,
            capability_scope=_nonempty(capability_scope, "capability scope"),
            evidence_ids=evidence_ids,
            authority_id=authority.authority_id,
        )
        self.store.put_immutable_object(
            "outcome_observation", observation.outcome_id, source_id, "recorded", observation
        )
        return observation

    def _receipt(self, **values: object) -> LearningTriageReceipt:
        values["outcome_ids"] = _ids(cast(tuple[str, ...], values["outcome_ids"]), "outcome id")
        values["triage_id"] = content_digest({"learning_triage": values})
        receipt = LearningTriageReceipt(**values)
        self.store.put_immutable_object("learning_triage", receipt.triage_id, receipt.gap_id, "recorded", receipt)
        return receipt

    def _gap(self, outcomes: tuple[OutcomeObservation, ...]) -> ObservedGap:
        scope, fingerprint = outcomes[0].capability_scope, outcomes[0].problem_fingerprint
        if fingerprint is None or any(
            item.capability_scope != scope or item.problem_fingerprint != fingerprint for item in outcomes
        ):
            raise StateConflict("outcomes must share a non-empty scope and fingerprint")
        evidence_ids = _ids(tuple(item for outcome in outcomes for item in outcome.evidence_ids), "evidence id")
        if not evidence_ids:
            raise StateConflict("learning gaps require evidence")
        gap = ObservedGap(
            gap_id=content_digest(
                {
                    "gap": {
                        "scope": scope,
                        "fingerprint": fingerprint,
                        "outcomes": _ids(tuple(item.outcome_id for item in outcomes), "outcome id"),
                    }
                }
            ),
            problem_fingerprint=fingerprint,
            capability_scope=scope,
            outcome_ids=tuple(item.outcome_id for item in outcomes),
            evidence_ids=evidence_ids,
            recurrence=len({item.source_id for item in outcomes}),
        )
        self.store.put_immutable_object("observed_gap", gap.gap_id, None, "recorded", gap)
        return gap

    def _parent_loop(self, goal_id: str | None) -> str:
        matches = [
            item
            for item in self.store.list_objects("loop", LoopRecord)
            if item.goal_id == goal_id and item.kind is LoopKind.META
        ]
        if len(matches) != 1:
            raise StateConflict("governed learning requires one parent meta loop")
        return matches[0].loop_id

    def _case(
        self,
        outcomes: tuple[OutcomeObservation, ...],
        source: Literal["repeated_attributable_issue", "explicit_user_correction"],
    ) -> LearningTriageReceipt:
        gap, first = self._gap(outcomes), outcomes[0]
        signal = LearningSignal(
            signal_id=content_digest({"learning_signal": gap.gap_id, "source": source}),
            loop_id=self._parent_loop(first.goal_id),
            category="observed_capability_gap",
            severity=1,
            recurrence=gap.recurrence,
            blocks_goal=False,
            user_corrected=source == "explicit_user_correction",
            evidence_ids=gap.evidence_ids,
            source=source,
            observed_gap_id=gap.gap_id,
            problem_fingerprint=gap.problem_fingerprint,
            capability_scope=gap.capability_scope,
        )
        ticket_id = self.engine.enqueue(signal)
        if ticket_id is None:
            raise StateConflict("governed signal did not create a ticket")
        ticket = self.engine.get_ticket(ticket_id)
        case = self.engine.create_case(
            ticket_id,
            gap_id=gap.gap_id,
            problem_statement=f"Observed governed gap: {gap.problem_fingerprint}",
            evidence_ids=gap.evidence_ids,
            problem_fingerprint=gap.problem_fingerprint,
            capability_scope=gap.capability_scope,
        )
        return self._receipt(
            gap_id=gap.gap_id,
            outcome_ids=tuple(item.outcome_id for item in outcomes),
            disposition="learning_case",
            reason="repeated attributable verifier failures"
            if source == "repeated_attributable_issue"
            else "explicit user correction",
            signal_id=signal.signal_id,
            ticket_id=ticket.ticket_id,
            case_id=case.case_id,
        )

    def triage(
        self, outcomes: tuple[OutcomeObservation, ...], *, preference: MemoryProposal | None = None
    ) -> LearningTriageReceipt:
        if not outcomes:
            raise StateConflict("triage requires persisted observations")
        durable = tuple(
            self.store.get_object("outcome_observation", item.outcome_id, OutcomeObservation) for item in outcomes
        )
        if durable != outcomes or len({item.outcome_id for item in durable}) != len(durable):
            raise StateConflict("triage observations must be distinct persisted receipts")
        for item in durable:
            if item.authority_id is None:
                raise StateConflict("triage observations require source authority")
            authority = self.store.get_object("outcome_source_authority", item.authority_id, OutcomeSourceAuthority)
            if not self._matches_authority(item, authority):
                raise StateConflict("triage observation does not match its source authority")
        kinds = {item.outcome_kind for item in durable}
        if len(kinds) != 1:
            raise StateConflict("mixed outcome kinds fail closed")
        kind = durable[0].outcome_kind
        if kind == "verified_failure" and any(
            item.source_kind != "trial_verifier" or item.trial_id is None for item in durable
        ):
            raise StateConflict("verified failures must be durable trial-verifier observations")
        if len(durable) > 1 and (
            len({item.capability_scope for item in durable}) != 1
            or len({item.problem_fingerprint for item in durable}) != 1
        ):
            raise StateConflict("mixed outcome scopes or fingerprints fail closed")
        if kind == "verified_failure":
            if len({item.source_id for item in durable}) < 2:
                return self._receipt(
                    gap_id=None,
                    outcome_ids=tuple(item.outcome_id for item in durable),
                    disposition="observe",
                    reason="one verified failure is insufficient",
                )
            return self._case(durable, "repeated_attributable_issue")
        if kind == "explicit_user_correction":
            if len(durable) != 1:
                raise StateConflict("explicit corrections triage one receipt at a time")
            return self._case(durable, "explicit_user_correction")
        if kind == "persistent_user_preference":
            if len(durable) != 1 or preference is None:
                raise StateConflict("persistent preferences require one matching proposal")
            item = durable[0]
            if (
                preference.source_class != "user"
                or preference.purpose != "user_preference"
                or preference.user_scope.strip() in {"", "*", "global"}
                or preference.workspace_scope.strip() in {"", "*", "global"}
                or item.source_id not in preference.provenance_ids
            ):
                raise StateConflict("preference proposal does not match governed user outcome")
            memory = MemoryFirewall().accept(preference)
            MemoryStore(self.store).save(memory)
            return self._receipt(
                gap_id=None,
                outcome_ids=(item.outcome_id,),
                disposition="preference_binding",
                reason="scoped persistent user preference",
                memory_id=memory.memory_id,
            )
        if preference is not None:
            raise StateConflict("only persistent preferences accept a memory proposal")
        disposition = cast(
            Literal["observe", "current_fix"],
            "current_fix" if kind in {"one_off_user_choice", "runtime_failure"} else "observe",
        )
        return self._receipt(
            gap_id=None,
            outcome_ids=tuple(item.outcome_id for item in durable),
            disposition=disposition,
            reason=f"{kind} does not qualify for learning",
        )

    def _conclusion(self, **values: object) -> LearningConclusionReceipt:
        values["conclusion_id"] = content_digest({"learning_conclusion": values})
        receipt = LearningConclusionReceipt(**values)
        self.store.put_immutable_object(
            "learning_conclusion", receipt.conclusion_id, receipt.triage_id, "recorded", receipt
        )
        return receipt

    def _evidence_ids_exist(
        self, evidence_ids: tuple[str, ...], *, label: str, required: bool = True
    ) -> tuple[str, ...]:
        normalized = _ids(evidence_ids, label)
        if required and not normalized:
            raise StateConflict(f"{label}s are required")
        for evidence_id in normalized:
            self.store.get_object("evidence", evidence_id, EvidenceRecord)
        return normalized

    def _conclusion_chain(
        self, triage: LearningTriageReceipt, attribution: AttributionRecord
    ) -> tuple[ObservedGap, CaseRecord]:
        persisted_triage = self.store.get_object("learning_triage", triage.triage_id, LearningTriageReceipt)
        persisted_attribution = self.store.get_object("attribution", attribution.attribution_id, AttributionRecord)
        if persisted_triage != triage or persisted_attribution != attribution:
            raise StateConflict("conclusion requires exact persisted triage and attribution")
        if (
            triage.disposition != "learning_case"
            or triage.gap_id is None
            or triage.signal_id is None
            or triage.ticket_id is None
            or triage.case_id is None
        ):
            raise StateConflict("conclusion requires a persisted learning case")
        gap = self.store.get_object("observed_gap", triage.gap_id, ObservedGap)
        signal = self.store.get_object("learning_signal", triage.signal_id, LearningSignal)
        ticket = self.store.get_object("learning_ticket", triage.ticket_id, LearningTicket)
        case = self.store.get_object("case", triage.case_id, CaseRecord)
        if (
            ticket.signal_id != signal.signal_id
            or case.ticket_id != ticket.ticket_id
            or case.observed_gap_id != gap.gap_id
            or signal.observed_gap_id != gap.gap_id
            or signal.problem_fingerprint != gap.problem_fingerprint
            or ticket.problem_fingerprint != gap.problem_fingerprint
            or case.problem_fingerprint != gap.problem_fingerprint
            or signal.capability_scope != gap.capability_scope
            or ticket.capability_scope != gap.capability_scope
            or case.capability_scope != gap.capability_scope
            or attribution.case_id != case.case_id
            or attribution.triage_id != triage.triage_id
            or attribution.ticket_id != ticket.ticket_id
            or attribution.observed_gap_id != gap.gap_id
            or attribution.capability_scope != gap.capability_scope
            or attribution.observed_outcome != case.outcome
        ):
            raise StateConflict("conclusion chain bindings do not match")
        self._validated_gap_outcomes(self.store, triage, gap)
        chain_evidence = self._evidence_ids_exist(gap.evidence_ids, label="chain evidence id")
        attribution_evidence = self._evidence_ids_exist(
            attribution.supporting_evidence_ids + attribution.counterevidence_ids,
            label="attribution evidence id",
            required=False,
        )
        if not set(attribution_evidence).issubset(chain_evidence):
            raise StateConflict("attribution evidence must bind the persisted gap")
        return gap, case

    def _validate_lesson(self, lesson: LessonRecord, case: CaseRecord, gap: ObservedGap) -> None:
        if (
            lesson.status != "accepted"
            or lesson.case_ids != (case.case_id,)
            or not lesson.when
            or not lesson.not_when
            or not lesson.evidence_ids
            or not lesson.counterevidence_ids
            or lesson.target_scope != "repo_task_skill"
            or lesson.capability_scope != gap.capability_scope
        ):
            raise StateConflict("conditional lesson does not satisfy the governed gate")
        lesson_evidence = self._evidence_ids_exist(
            lesson.evidence_ids + lesson.counterevidence_ids, label="lesson evidence id"
        )
        if not set(lesson_evidence).issubset(set(gap.evidence_ids)):
            raise StateConflict("lesson evidence must bind the persisted gap")

    def conclude(
        self,
        triage: LearningTriageReceipt,
        attribution: AttributionRecord,
        *,
        lesson: LessonRecord | None = None,
    ) -> LearningConclusionReceipt:
        gap, case = self._conclusion_chain(triage, attribution)
        common = {
            "triage_id": triage.triage_id,
            "ticket_id": triage.ticket_id,
            "case_id": case.case_id,
            "attribution_id": attribution.attribution_id,
        }
        if attribution.status == "unknown":
            return self._conclusion(**common, outcome="no_lesson", stop_reason="attribution_unknown")
        if attribution.mutation_target != "repo_task_skill" or attribution.recommendation_only:
            return self._conclusion(**common, outcome="no_lesson", stop_reason="causal_layer_out_of_scope")
        if lesson is None:
            return self._conclusion(**common, outcome="no_lesson", stop_reason="insufficient_evidence")
        self._validate_lesson(lesson, case, gap)
        self.engine.accept_lesson(lesson)
        return self._conclusion(**common, outcome="conditional_lesson", lesson_id=lesson.lesson_id)
