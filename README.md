<div align="center">

<img src="docs/media/crystal-poster.png" alt="Crystal Terrain Sessions：在真实山形上留下第一条滑行线路" width="100%" />

# CRYSTAL / TERRAIN SESSIONS

**循着山势，压进粉雪，把你的线路留在山上。**

Real terrain. Fresh tracks. Your line.

[▶ 20 秒实机 Demo](docs/media/crystal-demo.mp4) · [开始滑行](#快速开始) · [技术与数据](docs/TECHNICAL.md)

[![Checks](https://github.com/hyjing/crystal-ski-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/hyjing/crystal-ski-simulator/actions/workflows/ci.yml)

**Three.js / WebGL** &nbsp; · &nbsp; **USGS 地形** &nbsp; · &nbsp; **OSM 雪道** &nbsp; · &nbsp; **可变形粉雪**

</div>

---

## 先滑一趟

[![粉雪滑行动态预览，点击打开完整 MP4 Demo](docs/media/crystal-preview.gif)](docs/media/crystal-demo.mp4)

**抬头是雪山，脚下是会回应的雪。** 从 Crystal Mountain 的坡面出发，收身顺坡提速，再压刃完成一道弯；雪板滑过的地方，会留下沟槽和堆起的雪边。

这是一个在浏览器里运行的 3D 滑雪原型。山形来自真实高程，雪道沿着实际地图坐标铺设；你可以跟着路标，也可以自由探索坡面。

[下载清晰版 MP4 · 20 秒 / 720p / 约 4.5 MB](docs/media/crystal-demo.mp4?raw=1)

<sub>视频为当前版本的浏览器实录，由演示脚本提供操控输入；动图截取自同一段录像。短片没有背景音乐。</sub>

## 一座山，几种不同的乐趣

| 沿真实山势选线 | 让雪留下你的轨迹 | 用弯形控制节奏 |
| :--- | :--- | :--- |
| USGS 高程还原山脊、坡向和落差，周边山群也有地理位置。 | 近处粉雪会压陷、形成雪边；侧滑与压刃会扬起雪雾。 | 顺坡提速、收身降低风阻，靠转弯和横切控速。 |

<table>
<tr>
<td width="50%"><img src="docs/media/crystal-powder.jpg" alt="Green Valley 粉雪滑行与航拍小地图" /><br /><strong>01 / 找到落线</strong><br />低姿态提速，压刃入弯，留下粉雪滑痕。</td>
<td width="50%"><img src="docs/media/crystal-resort.jpg" alt="真实地形上的雪场缆车、林地和滑行区域" /><br /><strong>02 / 看见整座山</strong><br />俯瞰真实山形，以及地图坐标上的缆车和雪场设施。</td>
</tr>
</table>

## 今天滑哪条？

| 线路 | 当前可玩范围 | 大致长度 / 落差 |
| :--- | :--- | :--- |
| 🔵 **Green Valley** | 从坡面入口开始的已映射线路 | 1.1 km / ↓ 272 m |
| 🔵 **Lucky Shot** | 已映射路段，尚非完整雪道 | 0.6 km / ↓ 213 m |
| 🟢 **Tinkerbell** | 已映射线路 | 1.1 km / ↓ 191 m |

线路名称参考 [Crystal Mountain 官方雪道地图](https://www.crystalmountainresort.com/the-mountain/trail-maps)，路径采用 OpenStreetMap 数据并与 USGS 地形对齐。这里的长度和落差按原型数据计算。

## 快速开始

准备 **Node.js 20.19+ 或 22.12+**，以及支持 WebGL 的浏览器。

```sh
git clone https://github.com/hyjing/crystal-ski-simulator.git
cd crystal-ski-simulator
npm ci
npm run dev
```

打开终端给出的本地地址，通常是 [http://127.0.0.1:5173](http://127.0.0.1:5173/)。选一条线路，点击「开始滑行」。

> 当前以本地试玩为主。这个仓库是私有仓库，克隆需要相应 GitHub 访问权限。

## 把第一道弯做好

| 操作 | 按键 |
| :--- | :--- |
| 左右转向 / 选择压刃方向 | **A / D** 或 **← / →** |
| 压刃入弯，沿上次选择的一侧转弯 | **空格** 或 **↓** |
| 收身，降低空气阻力 | **W** 或 **↑** |
| 从起点重新开始 | **N** |
| 返回最近检查点 | **R** |
| 跟随 / 俯瞰镜头 | **O** |
| 暂停 / 继续 | **Esc / P** |

**想慢一点？把弯转完整。** 顺着坡面会加速，逐渐横切坡面可以控速。空格会带动压刃入弯；用 A / D 决定往哪边转。右下角小地图可以切换地形和航拍图。

粉雪默认开启。速度模糊可以在顶部切换；当前默认关闭，以优先保证清晰度和流畅度。

## 地形有出处，细节在生长

- **山形**：USGS 3DEP 高程；滑行区域约 19.7 m 导出采样，周边山群约 120 m。导出间距不代表原始测绘精度。
- **雪道与设施**：© OpenStreetMap contributors，ODbL 1.0；使用雪道中心线、缆车路径与建筑轮廓。
- **林地参考**：公开的 USGS / USDA NAIP 无雪季航拍。用来约束植被分布，也能在小地图查看。
- **冬季外观**：粉雪层、滑痕、雪雾、人物和设施外观由项目制作；覆雪冷杉使用生成的透明纹理。

这是独立的早期原型，与 Crystal Mountain Resort 无关联。雪层形变属于视觉高度场模型，树林位置和建筑外观仍是近似；它不用于现实雪场导航，也未模拟跳跃、落地或完整人体动作。

## 继续往山里走

- [x] 真实高程 + 三条命名线路
- [x] 粉雪压痕、雪边与雪雾
- [x] 转弯、立刃、收身与检查点
- [x] 航拍地图、覆雪林地、缆车与建筑
- [x] GPU 粉雪更新、输入响应和帧时间优化
- [ ] 更自然的滑行动画与近景 3D 植被
- [ ] 更准确的冬季雪道边界与场景资源
- [ ] 用实拍和测量校准速度、抓地与雪感

## 打开引擎盖

| 想了解什么 | 从这里开始 |
| :--- | :--- |
| 架构、物理参数、数据坐标和导入命令 | [技术说明](docs/TECHNICAL.md) |
| 卡顿优化、帧耗时和可复现测量 | [性能记录](docs/PERFORMANCE.md) |
| 航拍、OSM、生成素材和完整提示词 | [资源来源](docs/ASSETS.md) |
| 已验证内容与当前边界 | [验证记录](docs/VALIDATION.md) |
| 后续开发范围 | [Scope](docs/SCOPE.md) |
| Demo 的录制与编码方式 | [媒体说明](docs/media/README.md) |

```sh
npm test              # 物理、地形、路线与粉雪回归检查
npm run build         # 生成静态构建
npm run bench:powder  # CPU 粉雪更新测量
```

<div align="center">

**下一趟，换一条线。**

Built on real terrain. Still finding its edges.

</div>
