# 文件试验准备失败收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件准备失败也清除本次新建副本，保持原任务与持久化失败证据。

**Architecture:** 复用 `runConversationFileTrial` 的 try/finally 和已有所有权检查，仅将准备操作纳入其范围，不增加扫描器。

**Tech Stack:** 既有 Node 22、TypeScript、Vitest、DSH 原生测试接缝。

## Global Constraints

- D: 15 GiB 底线／20 GiB 目标；生成物只在 D:/DevData，使用已有依赖。
- 不动旧残余、链接删除保护、持久化失败保留、真实反馈和原 NO-GO。
- 设计见 `../specs/2026-09-30-tianwen-trial-seed-cleanup-design.md`；持续推进授权已给出。

## Task 1: 准备阶段也具有收尾责任

Files: `packages/tianwen-runtime-bundle/src/conversation-file-trial.ts`；`tests/dsh-migration/conversation-file-trial.spec.ts`。
Interface: 现有函数签名不变，准备失败仍抛原错误，不产生模型请求或收据。

- [x] 新增实际准备失败反例，断言副本清空／原文件保留／零模型请求和零收据。
- [x] 定向运行新用例，确认失败原因是残留副本，保存 red.log。
- [x] 将 seed 与 prompt 移入既有 try，在代理创建前，不改工具与保留规则。
- [x] 运行文件试验和文件材料两组回归、八包类型，保留退出码与日志。
- [x] 只读审查，检查本轮测试根无残留及 D 剩余；写结果／交接，提交并推送 DEV（实际提交／推送身份见 D: 收据）。

29/29；修正新测试脚本参数为数组后最终该项 1/1（15 跳过），八包类型退出 0。额外整旧 spec 裸源码严格检查仍有 6 项、与基线完全相同，不宣称该检查通过。详情见 `../../operations/tianwen-trial-seed-cleanup-20260930.md`。
