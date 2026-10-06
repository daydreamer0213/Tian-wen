#!/usr/bin/env python3
"""天问证据报告 B：研究与激活报告。

只实现 docs/operations/evidence-report-batch-contract.md 中的 B 合同。
stdin 读取一个 JSON 对象，stdout 输出一个 JSON 对象。
无效输入：退出码 2，stdout 为 {"error":"invalid-evidence-records"}，stderr 为空。
有效输入：退出码 0，stdout 为规定 JSON，stderr 为空。
仅使用 Python 标准库；不读文件、不联网、不执行外部程序。
"""
import json
import math
import sys

# 无效输入时 stdout 的固定内容（不含换行）。
ERROR_OUTPUT = '{"error":"invalid-evidence-records"}'

# 顶层与每项的字段集合：输入恰为这些字段，多一个或少一个都无效。
TOP_KEYS = frozenset(("studies",))
ITEM_KEYS = frozenset(
    ("studyId", "purpose", "decision", "activationRecorded", "currentActive")
)
PURPOSES = frozenset(("natural", "controlled"))
DECISIONS = frozenset(("accepted", "rejected", "inconclusive"))

MAX_STUDIES = 64
MIN_ID_POINTS = 1
MAX_ID_POINTS = 256


class Invalid(Exception):
    """输入不符合合同。"""


def _object_pairs(pairs):
    """JSON 对象构造器：重复键直接判为无效。"""
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise Invalid()
        obj[key] = value
    return obj


def _constant(_token):
    """NaN / Infinity / -Infinity 不是合法 JSON 数字。"""
    raise Invalid()


def _finite_float(token):
    """拒绝溢出为无穷的浮点字面量（如 1e999）。"""
    value = float(token)
    if not math.isfinite(value):
        raise Invalid()
    return value


def _is_id(value):
    """ID 为 1–256 个 Unicode 标量码点的非空字符串；不归一化、区分大小写。"""
    if not isinstance(value, str):
        return False
    if len(value) < MIN_ID_POINTS or len(value) > MAX_ID_POINTS:
        return False
    for ch in value:
        if 0xD800 <= ord(ch) <= 0xDFFF:  # 排除代理码点，只允许标量码点
            return False
    return True


def _parse(raw):
    """解析单个 JSON 根；多根、重复键、非有限数均无效。"""
    text = raw.decode("utf-8")
    return json.loads(
        text,
        object_pairs_hook=_object_pairs,
        parse_constant=_constant,
        parse_float=_finite_float,
    )


def _build(data):
    """校验输入并按规定规则汇总；任何不符合即抛出 Invalid。"""
    if type(data) is not dict or set(data) != TOP_KEYS:
        raise Invalid()

    studies = data["studies"]
    if type(studies) is not list or len(studies) > MAX_STUDIES:
        raise Invalid()

    natural = []
    controlled = []
    accepted = []
    recorded = []
    active = []
    unknown = []
    natural_active = []
    pending = []
    seen = set()

    for item in studies:
        if type(item) is not dict or set(item) != ITEM_KEYS:
            raise Invalid()

        study_id = item["studyId"]
        if not _is_id(study_id) or study_id in seen:
            raise Invalid()
        seen.add(study_id)

        purpose = item["purpose"]
        if not isinstance(purpose, str) or purpose not in PURPOSES:
            raise Invalid()

        decision = item["decision"]
        if decision is not None and (
            type(decision) is not str or decision not in DECISIONS
        ):
            raise Invalid()

        recorded_flag = item["activationRecorded"]
        if type(recorded_flag) is not bool:
            raise Invalid()

        active_flag = item["currentActive"]
        if active_flag is not None and type(active_flag) is not bool:
            raise Invalid()

        # 激活记录要求 decision=accepted；当前生效要求已有激活记录。
        if recorded_flag and decision != "accepted":
            raise Invalid()
        if active_flag is True and not recorded_flag:
            raise Invalid()

        # 各状态独立归属，互不混算、互不提升为整体完成。
        if purpose == "natural":
            natural.append(study_id)
        else:
            controlled.append(study_id)
        if decision == "accepted":
            accepted.append(study_id)
        if recorded_flag:
            recorded.append(study_id)
        if active_flag is True:
            active.append(study_id)
        if active_flag is None:
            unknown.append(study_id)
        if purpose == "natural" and active_flag is True:
            natural_active.append(study_id)
        if decision == "accepted" and not recorded_flag:
            pending.append(study_id)

    return {
        "total": len(studies),
        "natural": sorted(natural),
        "controlled": sorted(controlled),
        "accepted": sorted(accepted),
        "activationRecorded": sorted(recorded),
        "currentActive": sorted(active),
        "currentActiveUnknown": sorted(unknown),
        "naturalCurrentActive": sorted(natural_active),
        "pending": sorted(pending),
    }


def _emit(text):
    payload = text.encode("utf-8")
    stream = getattr(sys.stdout, "buffer", None)
    if stream is None:
        sys.stdout.write(text)
    else:
        stream.write(payload)


def main():
    try:
        result = _build(_parse(sys.stdin.buffer.read()))
    except Exception:
        _emit(ERROR_OUTPUT)
        return 2
    _emit(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
