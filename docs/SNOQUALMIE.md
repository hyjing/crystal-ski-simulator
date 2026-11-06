# Snoqualmie 长线

四区独立加载，共 14 条至少 700m 的上站到下站行程。长度是映射折线的水平长度，落差取 USGS 高程；不是雪场公布的实测距离。多段组合行程按最难的映射段标注，不把每个短段单列。

| 区域 | 主线 | 起点缆车 → 终点缆车 | 长度 | 落差 | 行程难度 |
|---|---|---|---:|---:|---|
| west | Big Bill | Pacific Crest → Pacific Crest | 0.98 km | 210 m | 蓝道 |
| west | Main Chute | Wildside → Wildside | 0.91 km | 209 m | 蓝道 |
| west | Dodge Ridge | Dodge Ridge → Dodge Ridge | 0.87 km | 177 m | 蓝道 |
| west | Wildside Cat Track | Wildside → Wildside | 1.40 km | 209 m | 蓝道 |
| central | Alpine | Central Express → Central Express | 1.33 km | 287 m | 蓝道 |
| central | Bonanza | Central Express → Central Express | 1.46 km | 287 m | 蓝道 |
| central | Outback | Silver Fir → Silver Fir | 1.54 km | 316 m | 蓝道 |
| east | Milwaukee Ridge | East Peak → Rampart | 1.63 km | 257 m | 蓝道 |
| east | East Peak | East Peak → East Peak | 0.99 km | 335 m | 黑道 |
| east | Blowdown | Rampart → Rampart | 0.91 km | 236 m | 黑道 |
| alpental | Debbie's Gold | Armstrong Express → Armstrong Express | 1.31 km | 383 m | 蓝道 |
| alpental | Edelweiss Bowl | Edelweiss → Armstrong Express | 2.44 km | 703 m | 黑道 |
| alpental | Internationale | Edelweiss → Internationale | 1.38 km | 545 m | 双黑道 |
| alpental | Lower Internationale | Internationale → Internationale | 1.13 km | 392 m | 双黑道 |

地形与线路参考：[官方分区地图](https://www.summitatsnoqualmie.com/trail-maps)、[OpenStreetMap](https://www.openstreetmap.org/copyright)、USGS 3DEP 与 USGS / USDA NAIP。官方地图用于核对名称与区域，没有把地图画作当成可自由使用的游戏贴图。每条 itinerary 的 `osmWayIds` / `via` 保留了所经路段；`primaryWayId` 是主段，不代表完整行程全程都使用这个名称。

OSM 坐标决定线路，USGS 数据决定山形；并非改名后的 Crystal 地形。站区卸客雪坪、短站台引道（最长约 165m）和不超过 40m 的路网接点是人工近似。部分行程以另一条缆车的下站为终点，例如 Milwaukee Ridge 从 East Peak 上站经连接段到 Rampart 下站；菜单会标明。

不选：Revelation 的独立行程不足 700m；Kendall / Golden Nugget 当前路网未连通；没有把它们用长直线强行补齐。树林是 NAIP 推测的林冠候选，缆车沿地图坐标建模、站房外观是程序近似；暂无道路车辆或真实运营状态。Alpental 碗地与部分回程连接存在地图和现实的差异，不用于现实雪场导航。
