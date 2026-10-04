# 任务发布后的实时状态读取

全新parser批次首10调用读到GoalStatusNotFoundError，最终排空16调用；初始Planner已拆两Task，违反本批exact-one，是模型规划而非宿主内容review抢跑。首Task原Python拒绝，后续验收Task刚绑定尚未冷可读，来源/研究/方法效果0。完整原失败保留，不重跑或补评。

SDK agent/created是同步事件，不等待flush；现有绑定必须在驱动前生效，不能简单异步延迟破坏首请求准入。最短修复在运行宿主状态读取：原durable读取仅明确NotFound时，核当前v3执行绑定、实际live Agent、同Goal和冻结header；flush这一个原Session，等待后核绑定仍相同，再原durable读取一次。没有真实live Goal、绑定变动、持久化失败和其他错误仍拒绝。不得造active/complete/验收/source，旧冷读取API保持。

实际SDK与暂未可读控制验证此窗口、逻辑事件不变/0模型；定向回归和原构建、独立复核后收口。下一实验明确系统自动验收并在初规划超过一Task时立即保存停止；同时在排空后保留所有模型轨迹，分开首停与排空调用。D生成物，不增加原阶段门槛或自然等待。
