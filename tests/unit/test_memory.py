from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from tianwen.domain import ArtifactStatus, ArtifactVersion, EvidenceRecord, LessonRecord
from tianwen.memory import (
    CapabilityLedger,
    CapabilityObservation,
    MemoryFirewall,
    MemoryNeed,
    MemoryProposal,
    MemoryStore,
)
from tianwen.store import StateStore


def make_proposal(**overrides: object) -> MemoryProposal:
    values: dict[str, object] = {
        "user_scope": "user:alice",
        "workspace_scope": "workspace:repo-a",
        "purpose": "user_goal",
        "source_class": "local_repository",
        "claim": "Use the checked-in parser settings for migration tasks.",
        "conditions": {"task_type": "migration"},
        "provenance_ids": ("evidence-1",),
        "sensitivity": "internal",
        "retention_until": datetime.now(UTC) + timedelta(days=1),
    }
    values.update(overrides)
    return MemoryProposal(**values)


def memory_store_at(path: Path) -> MemoryStore:
    state = StateStore(path)
    state.initialize()
    return MemoryStore(state)


@pytest.mark.parametrize(
    "secret",
    [
        "API_KEY=secret",
        "token: secret",
        "password=secret",
        "-----BEGIN PRIVATE KEY-----",
        "Authorization: Bearer secret",
        "Cookie: session=secret",
    ],
)
def test_firewall_rejects_credential_like_text(secret: str) -> None:
    firewall = MemoryFirewall()
    proposal = make_proposal(claim=f"Never persist {secret}")
    assert firewall.reject_reason(proposal) == "credential-like value"
    with pytest.raises(ValueError, match="credential-like value"):
        firewall.accept(proposal)


@pytest.mark.parametrize("purpose", ["authorization", "user_preference"])
def test_external_content_cannot_write_authoritative_purposes(purpose: str) -> None:
    firewall = MemoryFirewall()
    proposal = make_proposal(source_class="untrusted_external", purpose=purpose)
    assert firewall.reject_reason(proposal) == "external/model-derived authority claim"


def test_firewall_rejects_empty_global_and_expired_scope_policies() -> None:
    firewall = MemoryFirewall()
    assert firewall.reject_reason(make_proposal(user_scope="global")) == "global scope is not allowed"
    assert firewall.reject_reason(make_proposal(workspace_scope="*")) == "global scope is not allowed"
    assert firewall.reject_reason(make_proposal(retention_until=None)) == "expiry policy is required"
    assert (
        firewall.reject_reason(make_proposal(retention_until=datetime.now(UTC) - timedelta(seconds=1)))
        == "expiry policy is expired"
    )


def test_search_uses_user_workspace_and_purpose_hard_filters_after_reopen(tmp_path: Path) -> None:
    path = tmp_path / "memory.db"
    store = memory_store_at(path)
    firewall = MemoryFirewall()
    wanted = firewall.accept(make_proposal())
    store.save(wanted)
    store.save(firewall.accept(make_proposal(user_scope="user:bob", claim="wrong user parser")))
    store.save(firewall.accept(make_proposal(workspace_scope="workspace:repo-b", claim="wrong workspace parser")))
    store.save(firewall.accept(make_proposal(purpose="verification", claim="wrong purpose parser")))

    packet = MemoryStore(StateStore(path)).search(
        MemoryNeed(
            user_scope="user:alice",
            workspace_scope="workspace:repo-a",
            purpose="user_goal",
            query="parser",
            conditions={"task_type": "migration"},
        )
    )
    assert tuple(item.claim for item in packet.items) == (wanted.claim,)
    assert packet.items[0].evidence_ids == ("evidence-1",)


def test_conflicting_memories_remain_separate_and_no_memory_returns_empty_packet(tmp_path: Path) -> None:
    store = memory_store_at(tmp_path / "memory.db")
    firewall = MemoryFirewall()
    empty = store.search(
        MemoryNeed(
            user_scope="user:alice",
            workspace_scope="workspace:repo-a",
            purpose="user_goal",
            query="parser",
            conditions={"task_type": "migration"},
        )
    )
    assert empty.items == ()
    first = firewall.accept(make_proposal(claim="Parser version is one."))
    second = firewall.accept(make_proposal(claim="Parser version is two."))
    store.save(first)
    store.save(second)
    packet = store.search(
        MemoryNeed(
            user_scope="user:alice",
            workspace_scope="workspace:repo-a",
            purpose="user_goal",
            query="Parser",
            conditions={"task_type": "migration"},
        )
    )
    assert {item.memory_id for item in packet.items} == {first.memory_id, second.memory_id}


def test_delete_source_deactivates_memory_removes_fts_and_invalidates_only_candidates(tmp_path: Path) -> None:
    state = StateStore(tmp_path / "memory.db")
    state.initialize()
    memories = MemoryStore(state)
    memory = MemoryFirewall().accept(make_proposal(provenance_ids=("evidence-1",)))
    memories.save(memory)
    evidence = EvidenceRecord(
        evidence_id="evidence-1",
        run_id="run-1",
        evidence_type="observation",
        result_class="succeeded",
        effect_class="read",
        version_bucket="unknown",
        cost_bucket="unknown",
        needed_user=False,
        safety_category="safe",
        summary="source",
        payload_digest="sha256:source",
        scope="scope",
        purpose="user_goal",
        source_class="local_repository",
        sensitivity="internal",
        provenance_ids=("source-1",),
    )
    state.put_object("evidence", evidence.evidence_id, None, "active", evidence)
    lesson = LessonRecord(
        lesson_id="lesson-1",
        case_ids=(),
        claim="claim",
        when=(),
        not_when=(),
        evidence_ids=("evidence-1",),
        counterevidence_ids=(),
        confidence_basis="basis",
        target_scope="scope",
    )
    state.put_object("lesson", lesson.lesson_id, None, "candidate", lesson)
    candidate = ArtifactVersion(
        artifact_id="artifact-1",
        artifact_type="skill",
        version_id="candidate-v1",
        parent_version_id=None,
        content_digest="sha256:c",
        content="candidate",
        evidence_ids=("evidence-1",),
        status=ArtifactStatus.CANDIDATE,
    )
    active = ArtifactVersion(
        artifact_id="artifact-2",
        artifact_type="skill",
        version_id="active-v1",
        parent_version_id=None,
        content_digest="sha256:a",
        content="published",
        evidence_ids=("evidence-1",),
        status=ArtifactStatus.ACTIVE,
    )
    state.put_object("artifact", candidate.version_id, None, candidate.status.value, candidate)
    state.put_object("artifact", active.version_id, None, active.status.value, active)

    receipt = memories.delete_source("source-1")

    assert memory.memory_id in receipt.affected_object_ids
    assert "source" not in str(receipt)
    assert (
        memories.search(
            MemoryNeed(
                user_scope="user:alice",
                workspace_scope="workspace:repo-a",
                purpose="user_goal",
                query="parser",
                conditions={"task_type": "migration"},
            )
        ).items
        == ()
    )
    assert state.get_object("lesson", lesson.lesson_id, LessonRecord).status == "invalidated_by_deletion"
    assert (
        state.get_object("artifact", candidate.version_id, ArtifactVersion).status
        is ArtifactStatus.INVALIDATED_BY_DELETION
    )
    assert state.get_object("artifact", active.version_id, ArtifactVersion).content == "published"
    assert state.list_events("governance:memory-deletion")[-1].kind == "governance_incident"


def test_capability_lookup_requires_every_condition(tmp_path: Path) -> None:
    state = StateStore(tmp_path / "memory.db")
    state.initialize()
    ledger = CapabilityLedger(state)
    wanted = CapabilityObservation(
        version_id="v1",
        task_type="migration",
        environment="linux",
        tools=("git",),
        risk="low",
        outcome="succeeded",
        cost=1,
        evidence_ids=("evidence-1",),
    )
    ledger.record(wanted)
    ledger.record(
        CapabilityObservation(
            version_id="v1",
            task_type="migration",
            environment="windows",
            tools=("git",),
            risk="low",
            outcome="succeeded",
            cost=1,
            evidence_ids=("evidence-2",),
        )
    )
    ledger.record(
        CapabilityObservation(
            version_id="v1",
            task_type="migration",
            environment="linux",
            tools=("shell",),
            risk="low",
            outcome="succeeded",
            cost=1,
            evidence_ids=("evidence-3",),
        )
    )
    ledger.record(
        CapabilityObservation(
            version_id="v1",
            task_type="migration",
            environment="linux",
            tools=("git",),
            risk="high",
            outcome="succeeded",
            cost=1,
            evidence_ids=("evidence-4",),
        )
    )
    assert ledger.lookup("v1", "migration", "linux", ("git",), "low") == (wanted,)
