# 棋子聚焦、两军形态与战斗声音

目标。点击双方棋子聚焦，以现有低多边形模型细化红方正规军与黑方荒野部族，修复急促步态，增强挥风、碰撞与胜利反馈。保持 .68 缩放、.545 根节点高度和象棋规则。

## Ground

main.ts 负责对象工厂、选子与动画时序。leg rig 按路程驱动双节 IK，combat rig 写上肢，details rig 写旗帜。OrbitControls 写相机。原声音用不同 AudioContext 且直接接 destination，缺少统一音量与静音边界。原士兵 3/(.68*.58)=7.6 周期/秒。根速度和模型尺寸不匹配。

## Sketch

候选 A。统一 AudioContext 总线，独立 CameraFocus 状态拥有跟随目标，保留原三套模型关节。
候选 B。逐模块扩展当前接口，阵营外形交给 details registry，步态继续距离驱动并降低地面行进速率。
选择。使用 A 的音频总线和聚焦状态，B 的模型与步态边界。避免引入统一巨型 troop controller。初次设计代理因模型容量失败；已有候选 grounding 信息与根代理共同综合，未声称跨模型共识。

数据。FocusState = free | tracking(pieceId,transition)。Faction spec 以 Side/PieceKind 穷尽登记。音频以 cue 和 effects/music bus 统一管线。步态速度使用 kind/pace/surface 的纯策略。

## Agree

任务和已有视觉目标明确，继续实现。

## Implement

- Blocking first steps。冻结 782a93c 基准源到 /tmp/factions-baseline，5177 明确根目录，先截图。
- Independent workstreams。模型代理负责 troop-details，动作代理负责 locomotion/combat，音频代理负责 game 音频模块，根负责相机和 main/index/styles 接线与原生验证。
- Shared mutable state。代理禁止写 main 与共享界面，根串行整合。
- Smallest safe decomposition。现有三个关节 owner 不合并，规则与地形不改。

## Scrap

若聚焦抢走吃子点击，分离聚焦/选中状态。若步态速度影响渡船，分开地面与水路时钟。若响度只提高波形且失真，回到带 headroom 的统一混音。

## Verification

实际 WebGL 双方 14 模型检阅，点击/敌方查看/吃子/退出/WASD/重置/移动跟随/窄屏，脚掌与根节点检查。实际 OfflineAudioContext 导出音频并测峰值/RMS/静音/胜利时长。单元测试与构建。独立复核后提交远端。

原则。Model the Domain 用明确焦点状态与阵营登记替代选中布尔。Prove It Works 要求实际点击和音频渲染，截图前后验证来源。

## 后续验证记录

初次实机聚焦确认中心正确，但树木遮住身体。将聚焦角度限制约42°之后仍有遮挡，因此增加一次八方位、三高度的真实地形射线检查。原独立报告 factions-focus-review.md 只覆盖该修复前的源码；最终聚焦修复由另一独立代理复核，见 focus-visibility-review.md 和相应源码清单。最终190测试与构建通过。

音频在原生 OfflineAudioContext 中重新渲染，默认将撞车的一秒RMS对比原版增加5.11dB。原版 sourcemap 与782a93c逐字节核对。峰值、取消与试听WAV保留。

第一次 before归档命令引用了不存在的package-lock.json而失败，修正归档文件列表后启动5177。截图脚本拒绝错误版本，最终before来自782a93c。验证中的Vite热更新导致数次观测作废，最终改用 /tmp/factions-final-site 的冻结副本5183。生产源码哈希在捕获前后比较。

环境中没有可用 GitHub connector、Origin CLI、control-ui、deslop 或 Comment Sicko 专用工具。GitHub使用已配置gh，浏览器使用原生Playwright/Chromium，提交前执行人工diff/comment检查与独立运行。未声称使用不可用工具。网络环境状态及策略已检查。

28组标准速度原生走子全部先通过。随后渡船用例错误地期待同岸起步出现等船，因此完整命令失败，未作为完整通过。改成对岸召船，并为每组走子保存检查点。最终完整回归使用3倍播放率，标准速度已观察结果单独保留在 factions-focus-standard-marches.txt。动图另用1倍速度在平地录制，并检查所请求步态确实生效，避免窄桥自动收步掩盖奔跑动作。

最终完成。完整原生回归成功退出，28组3倍速行走/奔跑、10项界面/战斗/声音/重置检查、对岸召船28帧等待与28帧乘船、252条甲板支撑射线全部通过。乘船无支撑缺口、无轮转，归一化船速2.6。两份最终动图各48帧全部不同，实际有效步态包含walk与run。补录采用预设的清晰观察方向，仍使用真实应用聚焦、走子与渲染回调。最终源码/模型截图/动图/原生报告/独立评审清单逐字节一致。
