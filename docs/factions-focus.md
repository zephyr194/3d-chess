# 棋子聚焦与两军战斗表现

点击棋子后，镜头移到棋子附近，以棋子为旋转和缩放中心，并跟随行军。红方采用制式军队装备，黑方采用荒野部族装备。棋子缩放仍为 `.68`，站位根高度仍为 `.545`，象棋规则和道路不变。

## 聚焦操作

- 点击任意一方的棋子，或在棋局图中点击棋子，进入聚焦。
- 点击当前行棋方时，同时显示合法落点。
- 已选中己方棋子时，点击合法的敌方目标仍然吃子。
- 聚焦期间滚轮缩放，镜头继续以该棋子为中心。
- 拖动、WASD、方向键、Esc 或“退出”按钮解除跟随。“恢复俯视”和“重新布阵”也解除聚焦。
- 系统开启减少动态效果时，镜头直接定位。

## 两军形态

| 兵种 | 红方正规军 | 黑方荒野部族 |
| --- | --- | --- |
| 兵卒 | 制式头盔、护颊、甲片、盾面铆钉 | 兽皮肩领、骨角、缝合皮盾 |
| 将帅 | 冠饰、分层甲胄、披风织边 | 骨饰酋长头冠、兽皮披肩、牙饰 |
| 仕士 | 冠帽、整齐袍饰、执笏 | 萨满骨面具、皮袍、木牌 |
| 马 | 额甲、制式辔头、鞍具 | 蓬松鬃毛、骨饰辔头、兽皮鞍 |
| 相象 | 额饰、织布披挂、修整象牙 | 骨饰头带、皮革披挂、兽牙挂饰 |
| 车 | 围栏、前甲、整齐护顶 | 原木横梁、皮革顶棚、粗绳束缚 |
| 炮 | 加固炮环、制式炮架 | 粗铁炮管、绳缚木架、骨饰 |

两军七类旗形各异。黑军旗帜采用破边轮廓，旗面文字与布料一起摆动。新增饰件跟随已有战斗关节。

红方模型检阅采用实际生产模型工厂，同一缩放。以下画面是独立模型检阅，不是对局布局。

[红军改造前](../screenshots/factions-focus/before/red-army.png) · [红军改造后](../screenshots/factions-focus/after/red-army.png)

[黑军改造前](../screenshots/factions-focus/before/black-army.png) · [黑军改造后](../screenshots/factions-focus/after/black-army.png)

## 行进表现

原士兵在标准速度下每秒约完成 7.6 个步态循环。模型尺寸与行进速度不匹配，形成快速抽动。本次按兵种步幅设定地面行进速度，并减小人物抬腿幅度。人形腿部待机膝角从约 77° 减到约 55°，起步与离船重新起步从中立站姿过渡。

标准泥路下，各步行兵种约每秒 1.25 至 1.65 个循环。奔跑约每秒 1.5 至 2.15 个循环，并提高地面行进速度。播放速度仍可途中调整。桥梁和栈道自动收步。渡船保持原有运行速度，乘船和等待期间腿与轮停止。

这是一次有意的行进时长调整。新版本的行走与奔跑不再保持相同到达时长。

[红军行走与奔跑](../screenshots/factions-focus/after/red-march.gif) · [黑军行走与奔跑](../screenshots/factions-focus/after/black-march.gif)

动图为浏览器原生应用回调在受控时间下逐帧导出，前半行走，后半奔跑，不代表实时帧率。GIF 无声音。

## 战斗声音

声音使用一个 AudioContext 和独立音乐、音效总线。默认战斗音量 75%，战鼓音量 40%，可分别调整。

- 挥动前有扫风声。兵、将、骑兵和战车在命中时叠加金属碰撞、低频冲击与余响。
- 象使用重踏，士使用木牌与音调反馈，炮在发射时爆鸣，命中时有第二层爆破。
- 胜利后停止原战鼓，播放约四秒的鼓点、号角音色与持续和弦。
- 关闭音效、把战斗音量调至零或重新布阵，会取消仍在播放和排队的效果。

[试听整段战斗与胜利声音](../screenshots/factions-focus/after/audio/battle-preview.wav) · [单独试听胜利](../screenshots/factions-focus/after/audio/victory.wav)

在 Chromium OfflineAudioContext 中，使用相同的一秒窗口比较“将撞击车”，新版本默认音量的 RMS 比原版高约 5.1 dB。这个数字只代表该音效与该混音设置。胜利声音可听至约 3.85 秒。最大音量叠加测试的峰值约 .937，没有超过数字满幅。

## 验证与复现

190 项单元测试及生产构建通过，包含象棋规则、道路支撑、脚掌接地、步态切换、阵营模型与声音事件。原生浏览器验证结果、源码哈希和录制信息见 [实机报告](../screenshots/factions-focus/after/verification.json)。独立补录的有效步态与逐帧信息见 [动图报告](../screenshots/factions-focus/after/recordings.json)。音频渲染、零音量及取消声音的采样结果见 [音频报告](../screenshots/factions-focus/after/audio/verification.json)。

```bash
npm test
npm run build
npm run dev -- --port 5180
python3 scripts/verify-factions-focus.py --base-url http://127.0.0.1:5180
python3 scripts/record-factions-march.py --base-url http://127.0.0.1:5180
python3 scripts/capture-factions-focus.py --stage after --base-url http://127.0.0.1:5180
python3 scripts/verify-battle-audio.py --base-url http://127.0.0.1:5180
```

原版截图来自提交 `782a93c2bd940a33570f1f84d5ed69410b3bf7f2` 的冻结源码。音频脚本可用 `--baseline-url` 比较该版本，并将服务器 sourcemap 源码与 Git 原版逐字节核对。

急弯和道路渐窄时仍可能有少量水平滑步。聚焦开始时会检查视线，尝试附近方位避开树木与山石。行军途中环境仍可能挡住部分棋身，可用滚轮或拖动调整观察位置。音效使用合成音色，试听效果取决于设备音量和扬声器。
