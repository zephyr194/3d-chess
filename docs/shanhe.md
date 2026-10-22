# 山河弈境改造与实机证据

本轮把游戏更名为「山河弈境」，以纸色战况条、木铜色边框和底部操作台围绕棋盘。桌面控件不覆盖行军区域，手机端在画面下方换行。交锋、破阵、将军和凯旋有独立战报，重置会取消计时器和未完成攻击。

棋盘横向站距从 `3.2` 增至 `4.4`，站位总宽度从 `25.6` 增至 `35.2`。棋子缩放仍为 `0.68`、根节点高度仍为 `0.545`，90 个站位和象棋规则保持一致。实际道路按新站位生成，没有通过拉伸场景根节点扩大棋子或船体。

外围山脊跟随新棋盘边界外移，避免边缘棋子落进旧山脊的凹槽。默认近景俯角适度提高，恢复俯视会真正退出全景。前后图中的默认角度因这项可见性修正有所不同。

树冠使用真实实例矩阵随风摆动，河流和支流光纹按方向流动，湖面波纹、22 片落叶和山间雾气使用同一个场景时钟。关闭风物或启用系统减少动态效果会恢复静止姿态。山体、道路、树干、棋子底座和渡船支撑面不会随风变形。

## 前后截图

基线为提交 `fc77fce`，使用真实 Chromium WebGL、1440 × 1024 桌面和 390 像素手机宽度。截图没有图像生成或合成。

| 画面 | 改造前 | 改造后 |
| --- | --- | --- |
| 初始棋盘 | [初始棋盘](../screenshots/shanhe/before/01-overview.png) | [初始棋盘](../screenshots/shanhe/after/01-overview.png) |
| 战场全景 | [战场全景](../screenshots/shanhe/before/02-landscape.png) | [战场全景](../screenshots/shanhe/after/02-landscape.png) |
| 手机布局 | [手机布局](../screenshots/shanhe/before/03-mobile.png) | [手机布局](../screenshots/shanhe/after/03-mobile.png) |

[交锋战报与实际攻击](../screenshots/shanhe/after/04-battle-banner.png) 来自一次真实走子和吃子。

## 验证范围

53 项测试覆盖坐标、90 个实际地面站位、每条道路的完整足迹支撑、双向渡船、10 回合合法终点可达性、七种攻击和动态效果复位。原有 `0.44` 足迹半径和高度容差保持不变。

浏览器实际点击红黑过河兵横移，核对棋局和三维状态；双向渡船保留每帧中心和周围八条实际网格射线；检查树冠、水纹、波纹、雾和落叶确实变化，而支撑面不动；检查横幅从交锋变为破阵，以及攻击中重置后没有过期结果。桌面操作台位于棋盘之外，390 像素宽页面没有横向溢出。

默认视角的可见性检查向 32 枚棋子的三个中心高度分别发射不透明环境射线。修正前有 11 枚的三个采样方向全部被挡住，最终结果保存在浏览器报告中。此采样不代表整个模型的可见面积，少量局部遮挡仍可通过旋转视角或棋局面板处理。

[浏览器机器报告](../screenshots/shanhe/after/verification.json) 和 [测试机器报告](../screenshots/shanhe/tests.json) 保存具体结果。独立实机审阅和发布记录见 [决策轨迹](../.audit/shanhe.tsv)。有限射线采样不代表对所有可能棋局的穷举证明。

## 复现

先在仓库中运行 `npm run dev -- --port 5173 --strictPort`。验证命令如下。

```bash
npm test
npm run build
python scripts/capture-shanhe.py --stage after --verify
```

合并后在 `main` 上运行录制，需 Python Playwright、Chromium 和 FFmpeg。

```bash
python scripts/record-shanhe.py
```

录制脚本通过原有棋局面板事件驱动行军、渡船和七种吃子，逐帧捕获真实浏览器画面。测试布局只通过浏览器响应注入，不修改产品源码，也不替换模型动画。浏览器时钟以 `125ms` 步长推进原有 RAF 回调，再以每秒 8 帧导出 GIF；这样可避免云端软件渲染漏过关键动作。这是确定性逐帧导出，不是设备实时帧率录像。机器报告包含开始提交、`src` 树哈希和录制脚本哈希；录制过程中不修改产品源码。

本轮暂停 GitHub Pages 发布。设计取舍、源码所有权和独立审阅方法见 [实施方案](../.audit/shanhe-design.md)。

## 主分支交付

产品改造通过 [PR #1](https://github.com/zephyr194/3d-chess/pull/1) 合并到 `main`，合并提交为 `e9ffca534566c7605656671a7ab9632f674cd4ba`。合并后核对 `src` 树哈希仍为 `4dac285b18a54954466f4e940445a7c8dcd18dc4`，与独立验证的代码一致。

以下动图均在合并后从该提交的浏览器实机画面逐帧导出，分辨率为 960 × 760；不代表设备实时帧率。

| 动图 | 时长 | 内容 |
| --- | --- | --- |
| [山水风物](../screenshots/shanhe/gifs/01-living-landscape.gif) | 6.01 秒 | 河流、湖面、林动、落叶和山雾 |
| [渡船行军](../screenshots/shanhe/gifs/02-ferry-march.gif) | 8.01 秒 | 棋子乘船过河并继续沿路行军 |
| [七种兵种交锋](../screenshots/shanhe/gifs/03-seven-troop-attacks.gif) | 24.51 秒 | 兵、马、车、炮、象、士、将的独立攻击和战报 |

七次吃子均只触发一次命中并完成移除守方；录制过程没有浏览器错误。三段 GIF 已完整解码，分别包含 48、64、196 个不同画面，另各有一帧用于收尾。[录制记录](../screenshots/shanhe/gifs/recording.json) 保存源码与脚本哈希和攻击结果；[文件验证](../screenshots/shanhe/gifs/validation.json) 保存解码帧数、时长与 SHA-256。
