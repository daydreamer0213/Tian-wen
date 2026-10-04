# 原命令行宿主一次性任务收尾

上一轮df277d98交付job服务和原标准Loader消费。本轮真实待办是原宿主显式挂job-runner后自动委托该服务，并在原run结算/归档后输出和退出。复用原create-runner的appExit/异步apply模式，不建Context、Agent、调度器或学习裁决；job插件本身仍仅加载，不自动执行或给予同意。

使用已授权的原持续DEV Profile、当前发行、真实提供方及新job入口执行唯一首次任务。未知代码仅写scripts/development-native-job-runner.mjs。事前独立只读entry检查纯执行边界及插件接缝，期望全部固定；原八分钟上限、原文件权限/准备全核/程序检查/双审保持，不修复或重评首次答案。

接口：name=tianwen-development-native-job-runner；inject仅tianwenDevelopmentNativeTaskJob。runDevelopmentNativeJobRunner({job,signal,stdout,stderr,exit})验证原signal及四函数（job.run算一）后调用job.run(signal)一次，等待原结算。原result逐字JSON一行输出；completion failed、functional rejected、review unmet退出1，completed且functionalCandidateVerified严格true且review met退出0，其余退出2。退出0只是该任务当前检查通过，不是学习完成。原拒绝/取消写一行JSON error到stderr、退出1、返回{exitCode:1,result:null}；普通返回{exitCode,result}并保留result身份。错误IO不重试；exit仅调用一次，exit自身异常不再次调用exit。无新增结果存储或学习判断。

apply(ctx,{})只接受空配置，执行前要求原job及appExit函数；原上下文dispose取消一个自有AbortController，固定480000ms一次超时。委托上述函数，stdout/stderr用原process接口。在appExit前清掉自有timer及dispose监听，最终路径重复cleanup必须幂等；不dispose调用者Context/不改同意/不加Agent或重试。源码无第三方依赖，以原Loader元数据即可挂载。插件显式挂载是启动授权，不混在原job构造器里。

步骤：固定原入口和20个行为场景，确认未知输出不存在；独立复查合同与最小权限；冻结提交/原发行/账本及原JSON字节；由原标准Loader挂当前Runtime/job执行唯一真实模型任务，保存原Task/native/seal/程序/两审/首代码；0模型冷读核对；仅在原稿独立工程检查与实际SDK消费通过后逐字接纳。失败和工程诊断分开，不补自然来源或承诺一定触发研究。

答案未知前独立复查发现假job.run未核this，会放过真实Service receiver丢失。已在普通及插件场景断言原对象，并补stdout失败不重试、stderr自身失败仍先一次exit1再抛原IO错误；exit自身错误不二次exit。两项IO边界明确后为20场景。此时没有候选或模型请求，不是作答后增加标准。

标准Runtime仍使用既有受控五角色声明作未触发的工程配置；它们不当真实来源、反馈或新公开练习，不能冒充为本真实任务供应兼容研究。若来源组合不满足原选择器，研究保持0。真实研究、语义安全、自动采用、未来效果按原规则另核。原两问题+兼容成功、原五案例十臂、NO-GO、十工作日窗口保持，目标active/incomplete。

所有生成物在D:/DevData；复用依赖及原Profile，无环境副本；D至少15GiB，71拒删根不操作；原失败/首次自然记录不动。测试和运行自有容器按原生产者清理，Docker完成后停止。
