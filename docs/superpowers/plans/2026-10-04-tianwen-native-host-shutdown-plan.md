# 原 CLI 关闭前排空任务

沿用已授权的自主推进范围，直接执行。完整自动学习目标、原自然记录、门槛与发布 NO-GO 不变。

原因已由上一轮两份整体卸载失败及精确源码确认。选择在原 DSH 0.1.1-rc.2 的统一宿主关闭函数中先等待公开 `app/before-exit` 事件，再卸载原 Context；复用既有 pnpm patch。runner 注册该事件，取消并等待原 job 结算，在正常输出/退出前注销监听。保留原5秒强制退出、重复信号升级、退出码与未挂 runner 的行为。hook失败也卸载 Context 后将错误交回原退出控制器。无需修改 Cordis 的全树清理、绕过服务失效检查或建新运行时。

- [x] 实际原 CLI 新隔离 Profile 的 SIGINT/SIGTERM 监听路径先红：任务取消与收尾必须先于服务清理；无模型/学习来源。
- [x] 加关闭前事件与 runner 生命周期；hook自身重复/取消/正常完成不死锁，不重启任务。
- [x] 组合核验：原 CLI 信号入口；合法 DEV Context 的实际 Runtime/原准备/SDK/scripted adapter 调用同一已安装 `disposeProfileContext`，验证原 Task/native/seal。不能宣称 DEV 挂入普通 CLI Profile 成功；不改判前轮失败。
- [x] 核对既有 CLI/model 一次性退出及任务相关回归，独立审查无有据 P1/P2。新增patch和lockfile匹配；本地运行安装字节与仓库patch一致。
- [x] 审计原账本/归档不变、D空间及自有资源释放后提交。16个本轮新建临时根清理，原Task及本轮完整归档逐文件摘要一致；71拒删根未碰。生成包约1MiB、D17.831GiB、Docker停止，最终审计见D包。

完整 DEV 挂入普通 CLI Profile 的工程尝试被原 canonical root/baseUrl 规则和嵌套 Loader ID 规则拒绝，均在模型/任务前失败，保留记录；未绕过规则。改为同一安装函数的组合验证，不继续嵌套 Loader 实验。六文件47项回归通过；随后两条新检查确认 hook失败仍等待其他owner并卸载、无owner保持旧卸载行为，关闭文件四项通过，其中两项与前组重叠。

Windows 下工程控制向子进程自身发出 Node 的 SIGINT/SIGTERM 事件，执行原 CLI 注册的实际处理器；不能宣称 Windows 原生 OS 信号投递或强制杀进程后仍保证归档。强制退出本来就不能保证排空，保持原语义并单独报告。
