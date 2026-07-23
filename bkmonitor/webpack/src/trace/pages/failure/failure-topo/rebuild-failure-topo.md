# Failure-Topo 模块化重构说明

> 状态：**已完成**（story=134583280）  
> 范围：`src/trace/pages/failure/failure-topo/` + `resource-graph/g6-behaviors.ts`  
> 过程记录：`.workbuddy/memory/`（按日日志 + `MEMORY.md`）

## 1. 背景与目标

### 重构前问题

- `failure-topo.tsx` 约 **3090 行**，G6 注册、数据请求、布局、交互、时间轴、Tooltip、生命周期耦合一处。
- 子模块散落在根目录 / `failure-topo-detail` / `components`，定位成本高。
- 类型大量 `any`，改动易误伤。
- `resource-graph` 与故障拓扑行为逻辑纠缠，曾引入滚轮 `e.graph` 为 `undefined` 的回归。

### 目标（达成情况）

| 目标 | 结果 |
|------|------|
| 按职责拆目录与文件 | ✅ `detail/` `toolbar/` `tooltip/` `legend/` `graph/` `composables/` `assets/` |
| G6 注册与业务逻辑分离 | ✅ `graph/*` + `composables/*` |
| 主文件变为编排层 | ⚠️ 约 **3090 → 693**（曾估 ~350，仍偏厚；见第 9 节） |
| 类型补齐 | ✅ `types/g6.ts` + `types/topo.ts` + `types/composable.ts` 分类管理 |
| 可渐进验证、可回滚 | ✅ 对应 4 个主题 commit |

## 2. 对应 Commit（时间正序）

1. **拓扑图相关文件归纳整理** — 目录归位与 import 修正（几乎纯移动）。
2. **G6 类型与交互行为重构** — `g6-types`、`graph/topo-*`、`behaviors`、`register-*`。
3. **响应式状态迁移** — 6 个 composables，主文件大幅瘦身。
4. **资源拓扑图抽取画布行为** — 删除 `shared/`，行为归 `resource-graph/g6-behaviors.ts`；修复滚轮 `this.graph`。

## 3. 当前目录结构

```
failure-topo/
├── failure-topo.tsx          # 编排：组装 composable、生命周期、watch、JSX
├── failure-topo.scss
├── utils.ts / node-type-svg.ts
├── feedback-cause-dialog.*
├── types/                    # TypeScript 类型声明（分类管理）
│   ├── index.ts              # 统一 re-export 入口
│   ├── topo.ts               # 拓扑业务类型（ITopoNode, IEdge, IEntity 等）
│   ├── g6.ts                 # G6 相关类型（CanvasByPointResult, ComboLabelPoint 等）
│   └── composable.ts         # Composable 公共类型（GraphAccess, TooltipAccess 等）
├── composables/              # Vue 组合式业务逻辑（对外保持 6 个入口）
│   ├── use-topo-state.ts     # 响应式状态、inject、DOM/G6 refs
│   ├── use-topo-data.ts      # 拉数、格式化、布局、刷新定时器
│   ├── use-topo-interaction.ts # 点击/缩放/反馈/侧滑等交互
│   ├── use-topo-timeline.ts  # 时间轴播放与帧切换
│   ├── use-topo-tooltip.ts   # G6 Tooltip + DOM tips
│   └── use-topo-graph.ts     # Graph 创建、事件、渲染、resize、cleanup
├── graph/                    # G6 注册与布局（尽量无 Vue 状态）
│   ├── get-canvas-by-point.ts # combo→画布坐标纯函数（与 resource-graph 共用）
│   ├── topo-node.ts / topo-edge.ts / register-combo.ts / register-all.ts
│   ├── behaviors/            # 故障拓扑专属拖拽/滚动
│   ├── elkjs-utils.ts / format-topo-data.ts / service-combo.tsx
├── detail/ toolbar/ tooltip/ legend/ assets/

resource-graph/
└── g6-behaviors.ts           # 资源拓扑专属行为（-base 后缀命名）
```

### 行数快照（约，便于对照）

| 模块 | 约行数 |
|------|--------|
| failure-topo.tsx | 693 |
| use-topo-state / data / interaction / timeline / tooltip / graph | 310 / 497 / 737 / 593 / 419 / 628 |
| graph/topo-node + topo-edge + behaviors + register | ~1100 |
| resource-graph/g6-behaviors.ts | 289 |

## 4. 运行时依赖与编排

```
useTopoState()
  → useTopoData(state, graphAccess)
  → useTopoInteraction(state, data, graphAccess, tooltipAccess, renderGraphAccess, emit)
  → useTopoTimeline(state, data, graphAccess, emit)
  → useTopoTooltip(state, data, interaction, g6TooltipRef, graphAccess)
  → useTopoGraph(state, data, interaction, timeline, tooltip)
主文件：onMounted / watch(topoStatus) / onUnmounted + 业务 watch + render
```

> 主文件以**整包**传入 `state` / `data` / `interaction` 等；各 composable 内部用子集接口约束所需字段。

### 跨模块协作约定

| 约定 | 说明 |
|------|------|
| `graphInstanceRef` / `g6TooltipRef` | 在 `use-topo-state` 声明 `shallowRef`；graph 在 `initGraph` 赋值，tooltip 在 `registerCustomTooltip` 中直接写 `g6TooltipRef.value` |
| `graphAccess` / `tooltipAccess` | 定义于 `types/composable.ts`；`{ getGraph }` / `{ getTooltip }` 读 shallowRef |
| `getComboCanvasBounds` | `graph/get-canvas-by-point.ts`；failure-topo interaction 闭包包装，resource-graph behaviors 直接调用 |
| `renderGraphFn` 前向引用 | interaction 依赖 `renderGraph`，但 graph composable 更晚创建；主文件先占位再回填，打破环 |
| Props | `selectNode` 在 `useTopoState` 内 `toRef(props, 'selectNode')`，整包传 state 即可保持响应式 |
| 生命周期 | composable 只提供 `initGraph` / `cleanupGraph` / `cleanupData` / `cleanupTimeline`；**何时**调用由主文件决定 |
| 行为命名 | failure-topo：`drag-canvas-move` / `custom-scroll-canvas`；resource-graph：`*-base`，避免全局注册冲突 |

## 5. 模块职责边界

| 模块 | 负责 | 不负责 |
|------|------|--------|
| use-topo-state | refs、inject、少量 computed | 请求、G6 事件 |
| use-topo-data | API、格式化、ELK、刷新定时器、边过滤 | UI 交互、播放队列 |
| use-topo-interaction | 侧滑/资源图/反馈/缩放/高亮等 handler | Graph 构造 |
| use-topo-timeline | 播放队列、帧渲染、playing emit | 首次拉数 |
| use-topo-tooltip | Tooltip 插件与 DOM tips | 业务跳转细节（可调 interaction） |
| use-topo-graph | new Graph、绑事件、render、resize、destroy | 业务状态定义 |
| graph/\* | registerNode/Edge/Combo/Behavior | Vue 响应式 |

## 6. 关键设计决策（为何这样）

1. **`shallowRef<Graph>`**：Graph 是重型命令式对象，不宜 `deepRef`；用 getter 注入避免循环依赖时拿不到实例。
2. **截断函数参数注入**：节点注册需要 canvas context，创建 Graph 后再 `createTruncateByTextWidth`。
3. **动画/边定时器模块内聚**：`clearActiveAnimations` / `clearEdgeIntervals` / `clearAllG6Animations`，卸载路径统一。
4. **不与 resource-graph 硬共享 Behavior 类**：差异含 combo label 联动、dragMargin、子 combo 过滤；G6 `registerBehavior` 无继承，强行共享曾引入 bug。
5. **删除 `shared/`**：`createGetCanvasByPoint` 无引用方，各侧保留本地实现更清晰（纯函数抽取见第 9 节，不必恢复目录）。
6. **滚轮必须用普通函数 + `this.graph`**：箭头函数拿不到 behavior 上下文；`e.graph` 在 wheel 上不可靠。

## 7. 重构中已修复的问题（摘要）

- 画布不渲染：`initGraph` 回调时机早于 `topoRawData` 赋值。
- 滚轮报错：`e.graph` → `this.graph`（两边行为文件）。
- 卸载泄漏：补充 `graph.destroy()` 与 ref 置空；`cleanupData` 断开回调闭包。
- 节点 hover 泄漏：`handleNodeMouseLeave` 提前 return / combo hover 未清。
- 多处 tooltip `hide` 缺少可选链。

更细过程见 `.workbuddy/memory/2026-06-30.md` ~ `2026-07-24.md`。

## 8. 验收关注点（精简）

功能已人工验证无大面积回归时可按模块抽测：

- **渲染**：节点/边/combo/根因/聚合/文本截断
- **交互**：拖拽（含 combo label）、滚轮、节点约束、缩放、侧滑互斥
- **播放**：播/停/重置/拖帧/结束恢复刷新
- **Tooltip**：节点点击、边点击、聚合边、combo label、资源图互斥隐藏
- **资源拓扑**：拖拽无留白、滚轮无报错、行为名 `-base` 不冲突
- **卸载**：无定时器与 Graph 残留

分步超长验收清单历史版本见 `.workbuddy/memory/`，不必再堆进本文件。

## 9. 后续优化建议

### 9.1 已完成（2026-07-24）

| 项 | 做法 |
|----|------|
| 主文件接线变薄 | `failure-topo.tsx` 整包传 `state` / `data` / `interaction` / `timeline` / `tooltip`，不再手工拆装数十字段；`selectNode` 在 `useTopoState` 内 `toRef` |
| 统一小类型 | `types/composable.ts` 集中 `GraphAccess` / `TooltipAccess` / `RenderGraphAccess` / `TopoEmitFn` |
| 清理 setTooltip 桥接 | `useTopoTooltip` 直接写 `g6TooltipRef.value` |
| 命名统一 | 仅保留 `handleHideTooltips` |
| 纯函数抽取 | `graph/get-canvas-by-point.ts` 的 `getComboCanvasBounds`，failure-topo / resource-graph 共用 |
|类型收紧（减少 any）| composables/* 关键签名收窄：topoRawDataCache: Ref<TopoRawDataCache>、filterEdges/findEdges/processEdge: IEdge/ITopoNode、G6 事件 IG6GraphEvent；graph/ 行为与注册处使用官方类型并对非公开 API（如 shapeMap）仅做窄范围 any（附注释）；detail/tooltip/toolbar 收窄 PropType：IEdge/ITopoNode、聚合开关 AggregateSwitch，并补齐 refreshTime/showServiceOverview 透传链路 |

### 9.2 关于再拆 `use-topo-interaction` / `use-topo-graph`

**已决定：不再拆成更多 composable。** 保持 6 个入口即可；行数偏大可接受，避免交叉引用。

若日后文件难读，只允许：

- 文件内分区注释；
- 抽无 Vue 依赖的纯助手（单向被 composable 调用）。

禁止平行 `useXxx` 互相 import，也禁止按单个 handler 拆文件。

### 9.3 明确不建议的拆法

- 按单个 handler 一个文件。
- 再造一层互相引用的 `use-topo-xxx`。
- 强行让 resource-graph 与 failure-topo Behavior 继承复用。

## 10. 相关文档

- `.workbuddy/memory/MEMORY.md` — 架构决策与依赖链速查
- `.workbuddy/memory/2026-*.md` — 分步实施与踩坑日志
