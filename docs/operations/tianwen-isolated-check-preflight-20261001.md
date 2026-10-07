# 结果检查隔离环境：当前复用证据

## 结论与授权

基线 `29c555aeecb1191f3c0110d819984b11e0203751`、开发分支 `codex/conversation-claim-evidence`，开始时干净。上一目标轮完成真实的评价原因修复；本轮回到结果依据主线，不再选择维护回归题。所有者已要求自主选择能推进项目的工作，且不反复请求执行确认。

**当前既有 Docker/缓存 Python 可以启动并执行受限的可信检查程序。**这消除了“仅看见CLI、当前是否可复用未知”这个环境未知，不证明自然候选、任务合同、独立案例或语义结果通过。没有实现通用执行器、生产适配器、测试证书/注册表或研究采用接口。

## 当前外部状态与预检

初始 Docker Desktop/backend 进程无、WSL docker-desktop stopped、Linux引擎管道不可连接。settings-store 的 CustomWslDistroDir 指向 `D:/DevData/docker-desktop/wsl`；实际 docker_data.vhdx 与 ext4.vhdx 位于该目录。通过隐藏启动已有 Desktop，成功连接当前 Engine 29.6.1 / Docker Desktop 4.82.0 / linux amd64；没有安装、下载或修改启动设置。

当前缓存仅 Python 镜像：`python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7`，约189MB。核对本地RepoDigests、image ID、OS/架构，使用 `--pull never`。没有重跑旧Alpha A1—A5、nop/oracle或预置补丁。

独立于产品/模型的静态预检复用旧 Alpha 执行边界：无网络、只读根/宿主工作区/检查程序、UID/GID65532、cap-drop ALL、no-new-privileges，0.5CPU/128MiB内存、无额外swap/32进程、16MiB内存tmp、有限日志。创建后inspect这些主要字段及镜像/自有name/label，再启动。

首个容器在程序运行前失败：预检遗漏旧Alpha已有的 local日志 `compress=false`，与max-file=1不兼容。first-driver、started、失败receipt保留；按已存在配置只修这一项，另存logging-fixed收据。不是原生候选重试，也不是新任务结果。可信检查源/宿主canary摘要在两次一致。

修正后的7项静态条件通过：非root、初始canary准确、workspace/checks/root写入被阻止、一次外部socket连接失败、内存tmp可写；宿主文件摘要前后未变，容器退出0且非OOM。**网络隔离主要依据inspect NetworkMode:none，单次socket失败不能单独证明完整隔离。**资源数值经配置核对，不声称压力测试、任意恶意程序安全或所有宿主副作用不可能。

两个容器均按准确ID/name/label确认并删除，列表确认不存在。最后确认没有其他运行容器，使用已有 `docker desktop stop --timeout 45` 恢复原停止状态；调用退出0，Desktop/backend进程无、WSL docker-desktop stopped。没有把停止后的环境记作仍在运行的任务。

## 信任边界与下一入口

当前 `ConversationExternalCodeCheck` 合同明确禁止执行生成代码。**本次预检不能用改注释的方式扩大它。**可信Python检查仅把候选当数据读取，取得具体原任务合同后可能沿用该接口；导入/执行未知候选则需另外明确该实际任务的执行保护、冻结检查、结果身份、取消/超时和收尾合同，不能凭环境配置放行。

Python缓存不证明天问TypeScript功能测试可运行，更不证明检查覆盖原要求。仍须自主选定真实未完成待办、候选之外已存在的要求/检查与独立输入，确认环境适配后才冻结一次尝试；不为利用镜像造新题、不使用旧失败或预编反馈凑支持、不在缺合同前扩建verifier平台或拉新运行时。

完整目标active，C—F、main/Daily完整学习NO-GO、新激活隔离、原门槛和十工作日窗口保持。模型/自然候选/反馈/研究/激活均0；本次只读反证审查认可环境能力及以上边界，无重要问题。

## 资源和清理拒绝

记录在 `D:/DevData/tianwen-isolated-check-preflight-20261001`，约20KiB（两个小驱动、必要收据及探针/canary残余），没有Profile、依赖或项目副本。Docker运行期间D从19998818304降至19927515136字节，停止后回到约19995635712字节（18.62GiB）；满足15GiB底线，未达20GiB目标。既有VHD/缓存镜像没有复制、移动或删除。

在校验容器清除、文件摘要、D自有范围与无链接后，拟删除本项6个临时子目录；自动审批在创建进程前以 **blocked by policy** 拒绝，没有更具体理由。删除未执行，不更换方式绕过；cleanup-blocked.json 保留此事实。不声称临时目录全部清净，已清除的是两个容器。此小残余没有阻塞空间底线或其他授权工作。
