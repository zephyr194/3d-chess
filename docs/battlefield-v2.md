# 连续地形、战斗动作与渡船

本轮保留棋子缩放 `0.68`、站位高度 `0.545`、90 个站位坐标和中国象棋规则。增加内场连续山脉、树林、湖泊和支流，七种模型的独立攻击，以及途中即时调速。

## 实机对照

截图来自 Chromium 的真实 WebGL 场景，1440 × 1024，同机位、同初始棋局。改造前固定为提交 `37b6fed641de990f941016e4ec7b6a9461a9bb7f`。图片没有经过生成或合成。

| 场景 | 改造前 | 改造后 |
| --- | --- | --- |
| 全景 | [全景](../screenshots/battlefield-v2/before/01-overview.png) | [全景](../screenshots/battlefield-v2/after/01-overview.png) |
| 渡口 | [渡口](../screenshots/battlefield-v2/before/02-ferry.png) | [渡口](../screenshots/battlefield-v2/after/02-ferry.png) |
| 山地与水系 | [山地与水系](../screenshots/battlefield-v2/before/03-watershed.png) | [山地与水系](../screenshots/battlefield-v2/after/03-watershed.png) |
| 湖泊近景 | [湖泊近景](../screenshots/battlefield-v2/before/04-lake.png) | [湖泊近景](../screenshots/battlefield-v2/after/04-lake.png) |

[航行中的渡船](../screenshots/battlefield-v2/after/07-ferry-underway.png) 单独展示船体和乘客。这个画面取自实际走子过程。

## 地形与渡船

原来的植树规则要求离站位至少 `2.35`，但格距 `3.2` 的正方形内，离最近站位的距离至多约 `2.263`。这使大多数内场树木无法生成。原来的道路整平带也占用了过多山地，并可能填平水道。

现在用 `sampleLandscape` 统一采样高度、林区和湿地，用 `waterAt` 驱动河床和跨溪桥。连绵山脊进入棋盘内部，连接山麓、林地、两处不规则湖泊、六条支流和平原。水系的流向数据均能追溯到主河。固定种子 `194` 提供可重现的次级形态变化，主路和站位不会随机改变。

实机测得内场树干实例从 1 棵增加到 45 棵。边界按站位矩形 `|x| < 12.8`、`|z| < 15.74` 统计。19 处跨溪小桥保持河床和通行面独立。内场实际地形顶点最高约 `6.81`，道路和站位仍保持统一水平面。

渡船改为尖首、斜舷和低船底，增加船肋、操舵桨、小篷和水线。主河水位统一为 `-0.15`，甲板仍为 `0.54`。船体长 `3.04`，小于两泊位间距 `3.4`。候船、登船、航行和离船继续共用原有时间线，不用移动长桥代替渡船，也不让船或棋子底座上下晃动。

## 合法落点与即时速度

基线中，红黑过河兵均已有左右走子的引擎能力。把兵放在两将同列的唯一遮挡位置后，只能向前，这符合将帅不能照面的规则。当前仓库没有产品内的自定义布局编辑器，因此浏览器验证使用响应注入的测试布局，再通过真实棋局面板点击走子。

本轮保留引擎，扩大合法目标光环，并让光环不被山体遮住。三维落点、路线预览和棋局面板继续读取同一个合法目标数组。过河兵选中提示说明横移能力；非法横移会说明是将帅照面或主帅受将。

速度从 `0.25×` 到 `3×` 可选，行军、渡船和攻击逐帧读取当前速度。基线实测将选项从 `0.62×` 改为 `1.7×` 后，当前行军仍约为 `0.62×`。新版浏览器记录见 [verification.json](../screenshots/battlefield-v2/after/verification.json) 的 `live_speed`，它比较实际传入行军时间线的增量与墙钟增量。这是控件生效验证，不是性能跑分。

## 七种真实模型攻击

每个兵种的真实模型部件绑定到具名关节。接敌后先停止行走，在目标前攻击一次，复位后沿实体路线走完最后一段，再提交吃子。重置会取消未完成动作并恢复姿态。

| 棋子 | 模型动作 | 实机关键帧 |
| --- | --- | --- |
| 兵卒 | 挺矛、抬盾 | [兵卒](../screenshots/battlefield-v2/after/attack-soldier.png) |
| 马 | 骑手前倾、压低长枪、马头俯仰 | [马](../screenshots/battlefield-v2/after/attack-horse.png) |
| 车 | 车体制动、撞槌前伸 | [车](../screenshots/battlefield-v2/after/attack-chariot.png) |
| 炮 | 炮架抬起、炮管后坐 | [炮](../screenshots/battlefield-v2/after/attack-cannon.png) |
| 象 | 抬足踏地、甩鼻和转头 | [象](../screenshots/battlefield-v2/after/attack-elephant.png) |
| 士 | 举起令牌 | [士](../screenshots/battlefield-v2/after/attack-advisor.png) |
| 将帅 | 转身横斩，握剑手臂随武器转动 | [将帅](../screenshots/battlefield-v2/after/attack-general.png) |

## 验证与复现

```bash
npm test
npm run build
python scripts/capture-battlefield-v2.py --stage after --verify
```

浏览器脚本需要 Python Playwright、`/usr/bin/chromium` 和本机 `5173` 上的 Vite。它只向浏览器中的源码响应追加检查接口，产品页面没有布局注入接口。

- 49 项单元测试覆盖棋规、实际地形与支撑三角形、全部站位、道路连通、水系流向、船体和七类动作。机器结果保存在 [tests.json](../screenshots/battlefield-v2/tests.json)。
- 实际点击红黑过河兵，比较引擎落点、三维光环和面板落点，然后分别向右走子。将帅照面布局被拒绝并显示原因。
- 实际行军中切换速度，并在乘船时再次切换。正常动态模式下检查双向渡船旅程，每帧向实际网格发射中心及半径 `0.44` 上的八条支撑射线，同时检查底座高度、缩放和乘船步态。
- 七次真实吃子分别记录关节变换、一次命中、复位和棋局提交。攻击中重置后恢复 32 枚棋子。390 像素宽界面没有横向溢出。

各项帧数、失败数和实机关节变换保存在 [浏览器报告](../screenshots/battlefield-v2/after/verification.json)。支撑验证是有限采样，未对所有可能棋局执行穷举。静态对照截图使用减少动态效果；双向渡船、途中调速和七类攻击使用正常动态模式。

## 设计与审阅记录

采用两份独立地形方案和一次裁决，选择共享水系采样器。另一个按区域拼装地块的方案容易重新形成棋格接缝，因此没有采用。保留已经验证的渡船时钟，减少对走子演出的影响。

按 `Model the Domain`，水系使用流向表，战斗使用按兵种区分的关节与动作表。按 `Fix Root Causes`，修正植树排除半径、整平范围和捕获旧速度值的闭包。按 `Prove It Works`，用真实网格射线和实际 UI 走子验证，再查看原生截图。

代码经独立只读正确性审阅和新增注释审阅。按项目配置，所有角色均继承父模型，不声称跨模型一致性。宿主未提供 Cursor 的 `control-ui`、`deslop`，分别使用 Playwright 实机操作和实际差异审阅完成对应检查。决策轨迹见 [.audit/battlefield-v2.tsv](../.audit/battlefield-v2.tsv)。
