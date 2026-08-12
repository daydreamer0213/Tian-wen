import json

import pytest

from tianwen.domain import ActionRecord, ActionStatus, EvidenceRecord
from tianwen.evidence import evidence_from_action, project_meta_telemetry


def make_action(**overrides: object) -> ActionRecord:
    values: dict[str, object] = {
        "action_id": "action-1",
        "run_id": "run-1",
        "tool_call_id": "call-1",
        "tool_name": "shell",
        "args_json": '{"command":"echo API_KEY=secret"}',
        "args_digest": "sha256:args",
        "effect_class": "read",
        "idempotency_key": "run-1:call-1",
        "status": ActionStatus.SUCCEEDED,
    }
    values.update(overrides)
    return ActionRecord(**values)


def make_evidence(**overrides: object) -> EvidenceRecord:
    values: dict[str, object] = {
        "evidence_id": "evidence-1",
        "run_id": "run-1",
        "evidence_type": "action_outcome",
        "result_class": "succeeded",
        "effect_class": "read",
        "version_bucket": "unknown",
        "cost_bucket": "unknown",
        "needed_user": False,
        "safety_category": "internal_action",
        "summary": "summary",
        "payload_digest": "sha256:payload",
        "scope": "user:local/workspace:repo",
        "purpose": "user_goal",
        "source_class": "action_record",
        "sensitivity": "internal",
        "provenance_ids": ("action-1",),
    }
    values.update(overrides)
    return EvidenceRecord(**values)


def test_evidence_mapper_redacts_secret_values_before_persistence() -> None:
    evidence = evidence_from_action(
        action=make_action(),
        summary="command failed with API_KEY=secret",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )
    assert "secret" not in evidence.summary
    assert "[REDACTED]" in evidence.summary


def test_evidence_mapper_redacts_complete_multiline_openssh_private_key() -> None:
    evidence = evidence_from_action(
        action=make_action(),
        summary=(
            "failure\n-----BEGIN OPENSSH PRIVATE KEY-----\n"
            "sensitive-key-material\n-----END OPENSSH PRIVATE KEY-----\nafter"
        ),
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )

    assert evidence.summary == "failure\n[REDACTED]\nafter"
    assert "sensitive-key-material" not in evidence.summary


@pytest.mark.parametrize(
    "path",
    [r"C:\private\client\plan.md", "C:/private/client/plan.md"],
)
def test_evidence_mapper_replaces_complete_windows_absolute_paths(path: str) -> None:
    evidence = evidence_from_action(
        action=make_action(),
        summary=f"{path} failed",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )

    assert evidence.summary == "<workspace> failed"
    assert "C:" not in evidence.summary


def test_evidence_mapper_uses_only_observable_action_fields() -> None:
    evidence = evidence_from_action(
        action=make_action(status=ActionStatus.WAITING_APPROVAL),
        summary="waiting",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )
    assert evidence.provenance_ids == ("action-1",)
    assert evidence.source_class == "action_record"
    assert evidence.sensitivity == "internal"
    assert evidence.result_class == "unknown"
    assert evidence.version_bucket == evidence.cost_bucket == "unknown"
    assert evidence.needed_user is True


def test_meta_projection_is_field_allowlisted() -> None:
    evidence = make_evidence(
        summary=r"C:\\private\\client\\plan.md failed with API_KEY=secret",
        payload_digest="sha256:x",
        scope="user:local/workspace:repo",
        purpose="user_goal",
    )
    projected = project_meta_telemetry(evidence)
    encoded = json.dumps(projected)
    assert "client" not in encoded
    assert "API_KEY" not in encoded
    assert set(projected) == {
        "evidence_type",
        "result_class",
        "effect_class",
        "version_bucket",
        "cost_bucket",
        "needed_user",
        "safety_category",
    }
