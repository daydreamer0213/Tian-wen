from __future__ import annotations

import re

from tianwen.domain import ActionRecord, ActionStatus, EvidenceRecord, content_digest

_CREDENTIAL = re.compile(
    r"(?ix)"
    r"(?:api[_-]?key|token|secret|password)\s*(?:=|:)\s*[^\s,;]+"
    r"|(?:authorization\s*:\s*(?:bearer|basic)\s+)[^\s,;]+"
    r"|(?:cookie\s*:\s*)[^\r\n]+"
    r"|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----.*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----"
)
_WINDOWS_PATH = re.compile(r"(?i)(?:[a-z]:\\|\\\\)[^\s,;]+")
_POSIX_PATH = re.compile(r"(?<!\w)/(?:[^\s,;]+)")


def _safe_text(value: str) -> str:
    value = _CREDENTIAL.sub("[REDACTED]", value)
    value = _WINDOWS_PATH.sub("<workspace>", value)
    return _POSIX_PATH.sub("<workspace>", value)


def _result_class(status: ActionStatus) -> str:
    return {
        ActionStatus.SUCCEEDED: "succeeded",
        ActionStatus.FAILED: "failed",
        ActionStatus.DENIED: "denied",
    }.get(status, "unknown")


def evidence_from_action(action: ActionRecord, summary: str, *, scope: str, purpose: str) -> EvidenceRecord:
    """Create a short, persistable observation without copying action arguments."""
    safe_summary = _safe_text(summary)
    return EvidenceRecord(
        evidence_id=content_digest(
            {
                "action_id": action.action_id,
                "summary": safe_summary,
                "scope": scope,
                "purpose": purpose,
                "status": action.status.value,
            }
        ),
        run_id=action.run_id,
        action_id=action.action_id,
        evidence_type="action_outcome",
        result_class=_result_class(action.status),
        effect_class=action.effect_class,
        version_bucket="unknown",
        cost_bucket="unknown",
        needed_user=action.status is ActionStatus.WAITING_APPROVAL,
        safety_category="internal_action",
        summary=safe_summary,
        payload_digest=action.result_digest or action.args_digest,
        scope=scope,
        purpose=purpose,
        source_class="action_record",
        sensitivity="internal",
        provenance_ids=(action.action_id,),
    )


def project_meta_telemetry(evidence: EvidenceRecord) -> dict[str, str | int | bool]:
    if not all((evidence.scope, evidence.purpose, evidence.source_class, evidence.provenance_ids)):
        raise ValueError("evidence projection requires scope, purpose, source_class, and provenance")
    return {
        "evidence_type": evidence.evidence_type,
        "result_class": evidence.result_class,
        "effect_class": evidence.effect_class,
        "version_bucket": evidence.version_bucket,
        "cost_bucket": evidence.cost_bucket,
        "needed_user": evidence.needed_user,
        "safety_category": evidence.safety_category,
    }
