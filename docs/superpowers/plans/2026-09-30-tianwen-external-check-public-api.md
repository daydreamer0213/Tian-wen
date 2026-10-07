# 外部检查公开类型入口实施计划

沿用持续推进授权，直接处理本项实际包接入缺口。设计见../specs/2026-09-30-tianwen-external-check-public-api.md。无需重新询问已有授权。

- [x] 在tests/dsh-migration/runtime-bundle.spec.ts增加真实包根类型消费者：合法宿主通过，非法检查状态与私有类导入失败。先观察当前包声明缺少类型的失败。
- [x] 在packages/tianwen-runtime-bundle/src/index.ts追加四个仅类型导出；刷新现有index.d.ts与index.js，不新增运行能力、依赖或公开子路径。声明生成实际缺扩充，judgment模块补直接官方空类型引用。
- [x] 验证消费者与既有包根运行依赖边界；核对新增导出不进入JS，八包严格类型检查、git差异检查。
- [x] 独立只读复核、记录失败与结果、空间/自有根核对，更新交接并保存DEV检查点，最终提交身份以finish.json为准。未取得新的实际待办/适用检查不能伪称已获得前瞻学习效果。
