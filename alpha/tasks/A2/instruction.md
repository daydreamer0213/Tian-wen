# 增加状态汇总功能

请只修改 `statuses.py`，新增：

`summarize_statuses(values: Iterable[str]) -> dict[str, int]`

要求：

- 复用现有 `normalize_status()` 规则；
- 返回且只返回 `queued`、`running`、`done`、`unknown` 四个计数；
- 四个键即使计数为 0 也必须存在；
- 能处理空输入、生成器、大小写/首尾空白和未知状态；
- 不修改输入；
- `normalize_status()` 和 `status_label()` 的现有行为必须保持；
- 只使用 Python 标准库。

可以按需运行已登记的 `public` 检查。不能运行任意 Shell，也不能读取最终验证器或参考答案。
