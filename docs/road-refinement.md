# 道路衔接与战场氛围

本次改造保留低多边形卡通场景。土路、泥路和山路采用不同的泥土颜色与不规则路肩，城门附近增加齐地面的嵌石。桥头增加实体护岸，栈道增加斜撑和岩石锚座。河面有短流光，瀑布出口增加泡沫与水雾，远处薄雾缓慢移动。减少动态效果设置会冻结环境动画。

棋子比例保持 `0.68`，90 个站位的根节点高度保持 `0.545`。棋盘常量、完整道路布局、象棋引擎和原有规则测试与基准提交 `de9d76a` 逐字节一致，记录在 [invariants.json](../screenshots/road-refinement/invariants.json)。

## 渡船先靠岸，再接人

旧版 `followMarch` 会在人物接近另一岸时直接移动船位，实测一次跳动 `3.4` 世界单位。旧测试在检测人物脚下之前先移动船，因此漏掉这段衔接。

新版由 `battlefield.startMarch(path, kind)` 编排行程。它在同一条时间表中记录人物距离和船位，依次执行岸边等待、空船靠岸、登船、运输和离船。人物在码头等待，船停稳后才上船。乘船和等待时，关节、车轮与踏步效果停止。重置或新行程会使旧句柄失效，防止旧动画再次移动船。

浏览器验收还复现了一个计时问题。`performance.now()` 初始化时间偶尔晚于首个动画帧时间，导致负时间传入行程并锁住走子。现在从第一个动画帧建立计时起点。实机脚本将帧时钟人为提前 100 毫秒，再通过真实棋局按钮走子，验证这类时钟起点差异不会锁住动画。

## 查看同机位截图

基准画面来自 `de9d76a` 源码的独立临时副本。两版使用同一脚本、1440 × 1024 视口、初始棋局和摄像机参数。截图来自实际 Three.js WebGL 渲染，没有使用概念图或图片加工。

| 机位 | 改造前 | 改造后 |
| --- | --- | --- |
| 全景 | [查看](../screenshots/road-refinement/before/01-overview.png) | [查看](../screenshots/road-refinement/after/01-overview.png) |
| 桥梁与瀑布 | [查看](../screenshots/road-refinement/before/02-crossings.png) | [查看](../screenshots/road-refinement/after/02-crossings.png) |
| 山间栈道 | [查看](../screenshots/road-refinement/before/03-cliff.png) | [查看](../screenshots/road-refinement/after/03-cliff.png) |
| 码头道路 | [查看](../screenshots/road-refinement/before/04-ferry.png) | [查看](../screenshots/road-refinement/after/04-ferry.png) |

实际合法炮吃子的行军过程还记录了[岸上候船](../screenshots/road-refinement/after/05-ferry-waiting.png)和[甲板运输](../screenshots/road-refinement/after/06-ferry-carriage.png)。

## 复核道路与走子

运行应用测试和构建：

```bash
npm test
npm run build
```

`vitest.config.ts` 将应用测试限定到 `tests/**/*.test.ts`。pstack 附带的 Bun 测试保持原样，不再被当作象棋项目测试执行。

道路测试覆盖全部 90 个实际地面站位、198 个路网节点与 203 条路线的连通性，以及 10 回合棋局中的合法终点可达性。静态道路每隔最多 0.45 世界单位，检测人物中心和半径 0.44 周围八个点的真实三角形支撑。动态渡船按每秒 60 步执行同样的检测，覆盖双向运输、对岸候船、阶段边界、途中重置和过期句柄。检测不会预先把船移到人物脚下。

启动开发服务后，运行真实浏览器验收：

```bash
python scripts/capture-road-refinement.py --stage after --verify
```

脚本需要 Python Playwright 和 `/usr/bin/chromium`。它通过棋局按钮和键盘执行合法走子，验证非法马步拒绝、炮吃子、渡船与栈道过河、手机布局及重置取消。标准速度的双向渡船行程逐帧检查人物脚下支撑、船速、站位高度、棋子尺寸及乘船时的步态。场景检查接口只注入浏览器响应，产品源码不包含测试入口。

原始结果保存在 [unit-tests.json](../screenshots/road-refinement/unit-tests.json) 和 [after/verification.json](../screenshots/road-refinement/after/verification.json)。逐帧数据保存在同目录的 `north-to-south-frames.json` 与 `south-to-north-frames.json`。这些是有限采样的实际几何与交互检查，不代表对所有可能棋局或所有连续位置的数学证明。

## 设计选择与执行分工

| 设计 | 取舍 |
| --- | --- |
| 可变阶段控制器 | 需要额外协调每次跨阶段剩余的时间，示例中的帧时长截断还可能丢失时间。 |
| 编译后的行程时间表 | 人物与船共用一个时钟，帧间隔变化时仍能直接求出同一行程位置。本次采用这一设计。 |

两份设计在独立目录中完成，由独立评审比较。主代理补充了离船时重置、重复重置、旧句柄与分段时间等价验证。实现由一个负责人修改道路场景、行军和对应测试，避免共享场景状态出现多处写入。主代理复核代码，并通过真实浏览器验收补上计时回归。

执行先保存基准画面与缺陷证据，再确定运输模型。测试范围修复独立提交。代码修改与浏览器证据分别由不同负责人处理，截图的 `before`、`after` 目录相互独立。棋子与渡船的共享运动状态由场景模块统一管理。
