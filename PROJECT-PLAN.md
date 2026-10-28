# 方块之间：项目规划

技术方案：使用原生 HTML、CSS、JavaScript 和 Canvas 2D，无框架、无外部资源、无构建步骤。浏览器直接打开也能运行，所有资源使用相对路径，支持 GitHub Pages 子目录。

```text
tetris/
├─ index.html            页面结构、游戏菜单与玩法说明
├─ styles.css            桌面布局、配色、动画与减少动态效果支持
├─ engine.js             纯游戏规则，浏览器与 Node.js 共用
├─ game.js               Canvas 绘制、键盘、音效、最高分、页面状态
├─ favicon.svg           页签图标
├─ .nojekyll             GitHub Pages 静态文件标记
├─ serve.cjs             可选的本地预览服务器
├─ package.json          无依赖的启动和测试命令
├─ tests/engine.test.cjs  游戏规则自动化测试
├─ README.md             启动、操作、规则、上传方法
├─ TEST-REPORT.md         测试结果与限制
└─ PROJECT-PLAN.md        本项目规划
```

实现顺序：先实现独立规则引擎，再制作界面与操作层，最后执行规则测试和浏览器验证。规则与绘制分开，以便直接测试旋转、碰撞、消行、计分、暂存、暂停和结束逻辑。

游戏选择：10 × 20 可见棋盘，顶部另外保留 2 个隐藏行；7-bag 随机抽取；双向旋转和 SRS 踢墙；500 毫秒锁定延迟，落地移动最多重置 15 次；预览 3 个方块；暂存、落点投影、软降/硬降、连击、连续四行消除奖励；每 10 行升级；离开窗口自动暂停。

交付范围：本地完整游戏、可上传 GitHub Pages 的静态文件、可复跑测试与中文说明。由用户自行上传与开启 GitHub Pages。
