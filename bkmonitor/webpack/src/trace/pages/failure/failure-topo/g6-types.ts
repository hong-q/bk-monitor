/*
 * Tencent is pleased to support the open source community by making
 * 蓝鲸智云PaaS平台 (BlueKing PaaS) available.
 *
 * Copyright (C) 2017-2025 Tencent. All rights reserved.
 *
 * 蓝鲸智云PaaS平台 (BlueKing PaaS) is licensed under the MIT License.
 *
 * License for 蓝鲸智云PaaS平台 (BlueKing PaaS):
 *
 * ---------------------------------------------------
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/**
 * failure-topo G6 相关类型声明
 * 为模块化重构提供类型基础，补充 types.ts 中缺失的 G6/交互/状态相关类型
 */

import type { IEdge, IEntity, ITopoCombo, ITopoNode } from './types';
import type { Graph, ICombo, INode } from '@antv/g6';

// ============================================================================
// G6 节点样式相关
// ============================================================================

/** 边聚合子边中 source/target 端的附加属性 */
export interface AggregatedEdgeSourceInfo {
  source_is_anomaly: boolean;
  source_is_on_alert: boolean;
  source_name: string;
  source_type: string;
}

export interface AggregatedEdgeTargetInfo {
  target_is_anomaly: boolean;
  target_is_on_alert: boolean;
  target_name: string;
  target_type: string;
}

// ============================================================================
// G6 边动画相关
// ============================================================================

/** 画布坐标转换结果（getCanvasByPoint 返回值） */
export interface CanvasByPointResult {
  bottomRight: { x: number; y: number };
  topLeft: { x: number; y: number };
}

// ============================================================================
// G6 画布坐标 / 拖拽相关
// ============================================================================

/** Combo 拖拽后 label 坐标缓存 */
export interface ComboLabelPoint {
  x: null | number;
  y: null | number;
}

/** 详情面板类型枚举 */
export type DetailType = 'edge' | 'node';

/** 时间轴差异帧数据 */
export interface DiffItem {
  [key: string]: any;
  create_time: number;
  showEdges: IEdge[];
  showNodes: ITopoNode[];
  showSubCombos: ITopoCombo[];
  content: {
    [key: string]: any;
    edges: IEdge[];
    nodes: ITopoNode[];
    sub_combos: ITopoCombo[];
  };
}

/** drag-canvas-move 行为的 this 上下文 */
export interface DragCanvasBehaviorContext {
  comboRect: DragCanvasComboRect;
  dragging: boolean;
  graph: Graph;
}

// ============================================================================
// Tooltip / 详情面板类型
// ============================================================================

/** drag-canvas-move 行为中的 comboRect 临时状态 */
export interface DragCanvasComboRect {
  bottomCombo?: ICombo;
  el: HTMLElement;
  height?: number;
  labelPoint?: { x: number; y: number };
  topCombo?: ICombo;
  width?: number;
  xCombo?: ICombo;
}

/** drag-node-with-fixed-combo 行为的 this 上下文 */
export interface DragNodeBehaviorContext {
  currentComboId?: null | string;
  currentNodes?: INode[];
  graph: Graph;
  origin?: { x: number; y: number };
}

/** 边动画定时器项 */
export interface EdgeIntervalItem {
  id: string;
  timer: null | ReturnType<typeof setInterval>;
}

/** 错误数据状态 */
export interface ErrorData {
  isError: boolean;
  isNoData: boolean;
  msg: string;
}

// ============================================================================
// 错误 / 状态类型
// ============================================================================

/** 反馈根因模型 */
export interface FeedbackModel {
  entity: IEntity;
}

// ============================================================================
// 播放 / 时间轴相关
// ============================================================================

/** combo 经过 formatComboOption 后的扩展字段 */
export interface FormattedComboFields {
  comboId: string;
  id: string;
  isCombo: boolean;
  type: string;
  labelCfg: {
    style: {
      fill: string;
      fontSize: number;
    };
  };
  style: {
    cursor: string;
    fill: string;
    radius: number;
    stroke: string;
  };
}

/** sub_combo 经过 formatSubcomboOption 后的扩展字段 */
export interface FormattedSubComboFields {
  comboId: string;
  id: string;
  isCombo: boolean;
}

/** 导航选中节点条目 */
export interface NavSelectNodeItem {
  entityId: string;
  id: string;
}

// ============================================================================
// 反馈根因相关
// ============================================================================

/** 节点详情 tooltip 条目 */
export interface NodeDetailTipItem {
  label: string;
  value: string;
}

// ============================================================================
// 交互 handler 参数类型
// ============================================================================

/** 节点样式属性集合（getNodeAttrs 返回值） */
export interface NodeStyleAttrs {
  groupAttrs: { fill: string; stroke: string };
  rectAttrs: { fill: string; stroke: string; };
  textAttrs: { fill: string };
  textNameAttrs: { fill: string };
}

/** 播放选项参数 */
export interface PlayOption {
  timeline?: unknown;
  value: boolean;
}

/** Tooltip 类型枚举 */
export type TooltipType = 'edge' | 'node';

// ============================================================================
// Combo 格式化相关
// ============================================================================

/** 拓扑数据缓存（核心状态容器） */
export interface TopoRawDataCache {
  diff: DiffItem[];
  latest: { [key: string]: any; nodes: ITopoNode[]; };
  complete: {
    [key: string]: any;
    combos: ITopoCombo[];
    edges: IEdge[];
    nodes: ITopoNode[];
  };
}

/** 文本截断函数签名（accumulatedWidth / createTruncateByTextWidth 的返回类型） */
export type TruncateByTextWidthFn = (text: string, maxWidth?: number) => string;

// ============================================================================
// 边聚合相关（IEdge 扩展字段）
// ============================================================================

/** 打开资源拓扑的参数 */
export interface ViewResourceParams {
  node: ITopoNode;
  sourceNode: ITopoNode;
}

/** 通过 tooltip 打开服务概览的参数 */
export interface ViewServiceParams {
  data: IEdge | ITopoNode;
  isAggregatedEdge: boolean;
  sourceNode: ITopoNode | null;
  type: TooltipType;
}
