# Codex内置浏览器验收：不打扰桌面的目录选择

2026-09-10用户明确要求：选工作区不得抢桌面、弹Windows选择框或依赖人工代选。
后续本项目独立IAB验收复用本方法；不修改用户Edge或Daily的个人配置。

## 已验证方法

安装的DSH0.1.1-rc.2自带两种目录选择交互。默认auto在Windows本地回环服务上
选择native，所以网页“添加工作区”曾弹系统选择框。该交互不是实模验收的必要
条件。现成browse组件可在网页内输入路径，和相同的原生Workspace服务对接；
不需要模拟文件上传、直接写工作区注册表或后台发送模型任务。

仅在**独立验收Profile**的`cordis.patch.yml`追加：

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse-backend
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: directory-picker-browse-surface
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

先保存原配置及哈希，验证其余模型/学习/权限设置逐字或解析后完全不变，再走
原公开host启动。`name`在原生patch中是**匹配条件，不是替换字段**；不得试图
给现有auto行换name。应停用auto并插入上述既有两组件，不再同时挂native。
若取证启动状态不是`observed`，先停止并诊断，不能按普通页面可打开就声称已接通。

网页中依次“添加工作区→编辑路径→输入绝对目录→回车→打开”，核对选中的真实
目录、标准模式、Workspace Write和既有模型设置。全过程只操作IAB，不调用系统
桌面点击、键盘注入或用户Edge。

## 025实际证据

025新Profile已按此方式选中
`E:/待清理/D盘迁移-2026-09-08/Tianwen-多文档容量-025/native-use/workspace`，
Workspace ID `10f42447-77ba-443b-a6db-6b37ca2b3a2e`，提交注册于
2026-09-10T03:06:26.663Z。随后原生创建普通Session，不是后台补造模型会话。

相关配置、启动和输入前绑定收据在E025/native-use/evidence：
`configuration-browse-v2-receipt.json`、`live-host-browse-v2.json`、
`static-freeze-browse-v2.json`、`pre-input-browse-v2-ready.json`。
首次name匹配错误和此前用户Esc停止现场均另名保留，未包装成首试成功。
这只证明目录选择不再需要系统弹窗；不替代文件学习或长期改善验收。
