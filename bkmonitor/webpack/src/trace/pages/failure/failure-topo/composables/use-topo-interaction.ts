/*
 * Tencent is pleased to support the open source community by making
 * 蓝鲸智云PaaS平台 (BlueKing PaaS) available.
 *
 * Copyright (C) 2017-2025 Tencent.  All rights reserved.
 *
 * 蓝鲸智云PaaS平台 (BlueKing PaaS) is licensed under the MIT License.
 *
 * License for 蓝鲸智云PaaS平台 (BlueKing PaaS):
 *
 * ---------------------------------------------------
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
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
 * @file 拓扑图交互处理 Composable
 * @description 负责管理 FailureTopo 组件的所有交互 handler
 *
 * ## 职责
 * - 节点/边概览交互（handleViewService*, handleViewResource）
 * - 边高亮交互（handleHighlightEdge, setHighlightEdge, clearEdgeState, toFrontAnomalyEdge, clearAllStats）
 * - 反馈根因交互（handleFeedBack, handleFeedBackChange, feedbackIncidentRootApi）
 * - 缩放交互（handleZoomChange, handleResetZoom, handleUpdateZoom）
 * - UI 控制交互（handleCollapseChange, handleShowLegend, handleHideToolTips, handleHideTooltips）
 * - 详情跳转交互（handleToDetail, handleToDetailSlider, handleToDetailTab, handleRootToSpan, goToTracePage）
 * - 聚合配置交互（handleUpdateAggregateConfig）
 * - 导航计算属性（navSelectNode）
 * - 辅助函数（handleNodeInfoTooltip, getCanvasByPoint, moveComboLabelPosition）
 *
 * ## 渐进式迁移策略
 * - renderGraph 留在主文件（是数据与交互的桥接函数，Step 10 移到 use-topo-graph）
 * - registerCustomTooltip 留在主文件（Step 9 移到 use-topo-tooltip）
 * - initGraph 事件绑定留在主文件（Step 10 移到 use-topo-graph）
 *
 * ## 依赖注入
 * - state: 从 useTopoState 接收响应式状态
 * - data: 从 useTopoData 接收数据和函数
 * - getGraph: () => Graph | undefined — 获取当前 Graph 实例（解决 let 变量问题）
 * - getTooltip: () => any — 获取当前 Tooltip 实例（解决 let 变量问题）
 * - renderGraphCallback: 渲染图表函数（主文件中定义，Step 10 内化）
 * - emit: Vue 组件 emit 函数
 */

import { type Ref, computed } from 'vue';

import { Message } from 'bkui-vue';
import { cloneDeep } from 'lodash';
import { feedbackIncidentRoot } from 'monitor-api/modules/incident';

import { checkIsRoot } from '../../utils';
import { typeToLinkHandle } from '../utils';

import type { DetailType, TooltipType } from '../g6-types';
import type { CanvasByPointResult, ComboLabelPoint } from '../g6-types';
import type { IEntity, IncidentDetailData, ITopoData, ITopoNode } from '../types';
import type { IEdge } from '../types';
import type { Graph } from '@antv/g6';

// ============================================================================
// 类型定义
// ============================================================================

/** Graph 实例访问器（解决 graph 是 let 变量的问题） */
export interface GraphAccess {
  getGraph: () => Graph | undefined;
}
/** renderGraph 回调（主文件中定义，Step 10 内化） */
export interface RenderGraphAccess {
  renderGraphCallback: (data?: any, renderComplete?: boolean) => void;
}

/** G6 Tooltip 插件实例访问器（解决 g6Tooltip 是 let 变量的问题） */
export interface TooltipAccess {
  getTooltip: () => any;
}

/** FailureTopo 组件 emits 事件类型（与 defineComponent emits 保持一致） */
export type TopoEmitEvent = 'changeSelectNode' | 'closeCollapse' | 'playing' | 'refresh' | 'toDetail' | 'toDetailTab';

export type TopoEmitFn = (event: TopoEmitEvent, ...args: any[]) => void;

/** useTopoInteraction 需要从 useTopoData 接收的数据子集 */
export interface TopoInteractionData {
  aggregateCall: Ref<boolean>;
  aggregateConfig: Ref<Record<string, any>>;
  aggregateVersion: Ref<boolean>;
  autoAggregate: Ref<boolean>;
  topoRawData: Ref<ITopoData | null>;
  topoRawDataCache: Ref<any>;
  filterEdges: (edges: any[], nodes: any[], nodeId: string) => any[];
  findEdges: (edges: any[], target: any) => any;
  getGraphData: (isAutoRefresh?: boolean) => Promise<void>;
  handleChangeRefleshTime: (time: number) => void;
  moveToCenterIfNeeded: (graph: Graph, itemId: string, containerWidth: number, containerHeight: number) => void;
}

/** useTopoInteraction 需要从 useTopoState 接收的状态子集 */
export interface TopoInteractionState {
  bkzIds: Ref<string[]>;
  curLinkedEdges: Ref<IEdge[]>;
  // Misc state
  detailInfo: Ref<Record<string, any>>;
  detailType: Ref<DetailType>;
  edgeDetail: Ref<IEdge>;
  // Feedback state
  feedbackCauseShow: Ref<boolean>;
  feedbackModel: Ref<{ entity: IEntity }>;
  graphRef: Ref<HTMLElement | null>;
  incidentDetailData: Ref<IncidentDetailData>;
  isClickEdgeItem: Ref<boolean>;
  isPlay: Ref<boolean>;
  nodeDetail: Ref<ITopoNode>;
  // Node selection state
  nodeEntityId: Ref<string>;
  nodeEntityName: Ref<string>;
  resizeCacheCallback: Ref<(() => void) | null>;
  resourceEdgeId: Ref<string>;
  resourceGraphRef: Ref<any>;
  resourceNodeId: Ref<string>;
  rootComboMovePoint: Ref<ComboLabelPoint>;
  selectNode: Ref<any[]>;
  showLegend: Ref<boolean>;
  showResourceGraph: Ref<boolean>;
  showServiceOverview: Ref<boolean>;
  showViewResource: Ref<boolean>;
  timelinePosition: Ref<number>;
  // DOM refs
  tooltipCompRef: Ref<any>;
  tooltipsEdge: Ref<IEdge>;
  // Tooltip state
  tooltipsModel: Ref<ITopoNode | ITopoNode[]>;
  tooltipsType: Ref<TooltipType>;
  // UI control
  zoomValue: Ref<number>;
  // Hooks
  t: (...args: any[]) => string;
  updateAlarmDetailData: (params: any) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** G6 默认缩放级别下限，数值 / 10 为真实结果值 */
export const MIN_ZOOM = 0.2;

// ============================================================================
// Composable
// ============================================================================

export type UseTopoInteractionReturn = ReturnType<typeof useTopoInteraction>;

export function useTopoInteraction(
  state: TopoInteractionState,
  topoData: TopoInteractionData,
  graphAccess: GraphAccess,
  tooltipAccess: TooltipAccess,
  renderGraphAccess: RenderGraphAccess,
  emit: TopoEmitFn
) {
  const graph = () => graphAccess.getGraph();
  const g6Tooltip = () => tooltipAccess.getTooltip();

  // ---------------------------------------------------------------------------
  // 导航计算属性
  // ---------------------------------------------------------------------------

  /** 根据左侧选中节点组计算出画布高亮节点信息 */
  const navSelectNode = computed(() => {
    const val = [...state.selectNode.value];
    const rootNode: { entity_name: string; entityId: string; id: string }[] = [];
    if (!val.length) return rootNode;
    topoData.topoRawData.value?.nodes?.forEach?.(node => {
      if (val.includes(node.id)) {
        rootNode.push({ id: node.id, entityId: node.entity.entity_id, entity_name: node.entity.entity_name });
      } else if (node.aggregated_nodes.length) {
        node.aggregated_nodes.forEach(aggNode => {
          val.includes(aggNode.id) &&
            rootNode.push({
              id: node.id,
              entityId: aggNode.entity.entity_id,
              entity_name: aggNode.entity.entity_name,
            });
        });
      }
    });
    return rootNode;
  });

  // ---------------------------------------------------------------------------
  // 辅助函数（供 initGraph / renderGraph 使用）
  // ---------------------------------------------------------------------------

  /** 获取相对位置 */
  const getCanvasByPoint = combo => {
    const g = graph();
    const comboBBox = combo.getBBox();
    return {
      topLeft: g.getCanvasByPoint(comboBBox.x, comboBBox.y),
      bottomRight: g.getCanvasByPoint(comboBBox.x + comboBBox.width, comboBBox.y + comboBBox.height),
    } satisfies CanvasByPointResult;
  };

  /** 拖拽时设置 combo label 的位置 */
  const moveComboLabelPosition = (point: { x?: number; y?: number }) => {
    const g = graph();
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getCombos().forEach(combo => {
      if (!combo.getModel().parentId) {
        (combo.getContainer() as any).shapeMap['text-shape'].attr(point);
      }
    });
  };

  /** 线置于顶层 */
  const toFrontAnomalyEdge = () => {
    const g = graph();
    const edges = g.getEdges();
    // biome-ignore lint/complexity/noForEach: <explanation>
    edges.forEach(edge => {
      edge.toFront();
    });
  };

  /** 清除边状态 */
  const clearEdgeState = (item: any, highlight = true) => {
    const g = graph();
    g.getEdges().forEach(edge => {
      g.clearItemStates(edge, ['dark', highlight && 'highlight']);
      g.setItemState(item, 'dark', true);
      edge.toFront();
    });
  };

  /** 清除高亮状态（供 initGraph click 事件使用） */
  const clearAllStats = () => {
    const g = graph();
    g.setAutoPaint(false);
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getEdges().forEach(edge => {
      const { source, target } = edge.getModel();
      if (`${source}-${target}` === state.resourceEdgeId.value) {
        edge.toFront();
        return;
      }
      g.clearItemStates(edge, ['dark', 'highlight']);
      // graph.setItemState(edge, 'dark', true);
      edge.toFront();
    });
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getNodes().forEach(node => {
      g.clearItemStates(node, ['dark', 'highlight']);
      node.toFront();
    });
    g.paint();
    g.setAutoPaint(true);
  };

  // ---------------------------------------------------------------------------
  // 节点详情 info tooltip
  // ---------------------------------------------------------------------------

  /** 处理节点详情 info tooltip 内部结构 */
  const handleNodeInfoTooltip = (model: ITopoNode) => {
    const isShowRootText = model.is_feedback_root || checkIsRoot(model?.entity);
    const isAggregatedNode = model.aggregated_nodes.length > 0;
    const nodeDetailTips: { label: string; value: string }[] = [];

    // 节点名称
    if (!isAggregatedNode) {
      nodeDetailTips.push({ label: state.t('名称'), value: model.entity.entity_name });
    }
    // 节点告警信息
    if (model.alert_display?.alert_name) {
      nodeDetailTips.push({
        label: state.t('包含告警'),
        value: `${model.alert_display?.alert_name} ${
          model.alert_display?.alert_name && model.alert_ids?.length > 1
            ? state.t('等共 {0} 个同类告警', [model.alert_ids.length])
            : ''
        } `,
      });
    }
    // 节点异常信息
    if (isShowRootText && model.entity?.rca_trace_info?.abnormal_message) {
      nodeDetailTips.push({ label: state.t('异常信息'), value: model.entity.rca_trace_info.abnormal_message });
    }
    // 节点其他信息组
    const res = [
      { label: state.t('分类'), value: model.entity.rank.rank_category.category_alias },
      { label: state.t('节点类型'), value: model.entity.properties?.entity_category || model.entity.rank_name },
      { label: state.t('所属业务'), value: `[#${model.bk_biz_id}] ${model.bk_biz_name}` },
    ];
    nodeDetailTips.push(...res);
    // 节点服务信息
    if (model.entity?.tags?.BcsService) {
      nodeDetailTips.push({ label: state.t('所属服务'), value: model.entity?.tags?.BcsService?.name });
    }

    // 聚合节点标题
    let aggregateTitleHtml = '';
    if (isAggregatedNode) {
      const { total_count, anomaly_count, entity } = model;
      const entityShowType = entity.properties.entity_show_type;
      const hasAnomaly = (anomaly_count as number) > 0;
      const titleText = hasAnomaly
        ? state.t('共 {0} 个 {1} 节点，其中 {2} 个异常', [
            `<span class="info-aggregate-title__weight">${total_count}</span>`,
            entityShowType,
            `<span class="info-aggregate-title__error-color">${anomaly_count}</span>`,
          ])
        : state.t('共 {0} 个 {1} 节点', [
            `<span class="info-aggregate-title__weight">${total_count}</span>`,
            entityShowType,
          ]);
      aggregateTitleHtml = `<div class='info-aggregate-title'>${titleText}</div>`;
    }

    const itemsHtml = nodeDetailTips
      .map(
        item =>
          `<div class='node-detail-tips_item'>
              <span class='item-label'>${item.label}：</span>
              <span class='item-value'>${item.value}</span>
            </div>`
      )
      .join('');

    return aggregateTitleHtml + itemsHtml;
  };

  // ---------------------------------------------------------------------------
  // 边高亮交互
  // ---------------------------------------------------------------------------

  /** 切换 node 清除高亮边信息 */
  const setHighlightEdge = (highlight = true, nodeId = '') => {
    const g = graph();
    if (state.resourceEdgeId.value) {
      const edge = g.getEdges().find(edge => {
        const { source, target } = edge.getModel();
        return `${source}-${target}` === state.resourceEdgeId.value;
      });
      highlight && edge && g.setItemState(edge, 'highlight', true);
      if (!highlight && edge) {
        const statesToClear =
          nodeId && state.resourceEdgeId.value.includes(nodeId) ? ['highlight'] : ['highlight', 'dark'];
        g.clearItemStates(edge, statesToClear);
      }
    }
    if (!highlight) state.resourceEdgeId.value = '';
  };

  /** 点击节点概览中的关联边，画布中对应的边高亮 */
  const handleHighlightEdge = (edge: ITopoNode) => {
    const g = graph();
    // 对于聚合边，每个边上会携带当前最外层作为容器变的属性，聚合边需要高亮的是容器边
    const isAggregated = edge?.properties?.aggregated_by?.length > 0;
    const sourceId = isAggregated ? edge.properties.aggregated_by[0] : edge.source;
    const targetId = isAggregated ? edge.properties.aggregated_by[1] : edge.target;
    state.resourceEdgeId.value = `${sourceId}-${targetId}`;
    g.setAutoPaint(false);
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getNodes().forEach(function (node) {
      g.clearItemStates(node, ['dark', 'highlight']);
      g.setItemState(node, 'highlight', true);
      node.toFront();
    });
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getEdges().forEach(curEdge => {
      g.clearItemStates(curEdge, ['dark', 'highlight']);
      g.setItemState(curEdge, 'dark', true);
      const sourceNode = curEdge.getSource();
      const targetNode = curEdge.getTarget();
      if (sourceNode.getID() === sourceId && targetNode.getID() === targetId) {
        g.setItemState(curEdge, 'dark', false);
        g.setItemState(curEdge, 'highlight', true);
        curEdge.toFront();
      }
    });
    g.paint();
    g.setAutoPaint(true);
  };

  // ---------------------------------------------------------------------------
  // 服务概览 / 资源拓扑交互
  // ---------------------------------------------------------------------------

  /** 通过主画布的 tooltip 打开节点/边概览 */
  const handleViewServiceFromTopo = ({ type, data: tooltipData, sourceNode, isAggregatedEdge }) => {
    const g = graph();
    const t = g6Tooltip();
    if (type === 'node') {
      setHighlightEdge(false, sourceNode.id);
      if (!state.showServiceOverview.value) {
        state.showServiceOverview.value = true;
      } else {
        const node = g.findById(sourceNode.id);
        g.setItemState(node, 'running', true);
      }
      // 如果之前有选中的节点且不是当前节点，取消其 'running' 状态
      if (state.resourceNodeId.value && state.resourceNodeId.value !== sourceNode.id) {
        const node = g.findById(state.resourceNodeId.value);
        g.setItemState(node, 'running', false);
      }

      state.nodeDetail.value = tooltipData;
      const { edges = [], nodes = [] } = topoData.topoRawDataCache.value.complete;
      state.curLinkedEdges.value = topoData.filterEdges(edges, nodes, tooltipData.id);

      // 保存当前选中节点的ID
      state.resourceNodeId.value = sourceNode.id;
      state.nodeEntityId.value = tooltipData?.entity?.entity_id || tooltipData?.model?.entity?.entity_id;
      emit('changeSelectNode', sourceNode.id);
    } else {
      if (!state.showServiceOverview.value) {
        state.showServiceOverview.value = true;
      }
      state.edgeDetail.value = tooltipData;
      state.isClickEdgeItem.value = true;
      // 处理聚合边，聚合边只有明确选中才高亮
      if (isAggregatedEdge) {
        const edges = g.getEdges();
        // 遍历每个边，查找匹配的属性
        const edge = edges.find(edge => {
          const model = edge.getModel();
          return (
            model.source === sourceNode?.[0]?.entity?.entity_id && model.target === sourceNode?.[1]?.entity?.entity_id
          );
        });
        if (!edge.hasState('highlight')) {
          clearEdgeState(edge);
          g.setItemState(edge, 'highlight', true);
          g.setItemState(edge, 'dark', true);
        }
      }
    }
    // 当前节点/边的类型
    state.detailType.value = type;
    state.tooltipCompRef.value?.hide?.();
    t?.hide?.();
  };

  /** 通过资源拓扑的 tooltip 打开节点/边概览 */
  const handleViewServiceFromResource = ({ type, data: tooltipData }) => {
    if (type === 'node') {
      if (!state.showServiceOverview.value) {
        state.showServiceOverview.value = true;
      }
      state.nodeDetail.value = tooltipData;
      const { edges = [], nodes = [] } = topoData.topoRawDataCache.value.complete;
      state.curLinkedEdges.value = topoData.filterEdges(edges, nodes, tooltipData.id);
      state.detailType.value = 'node';
      state.showViewResource.value = false;
    }
  };

  /** 通过顶部开关打开节点/边概览，展示当前选中节点的概览 */
  const handleViewServiceFromTop = () => {
    const g = graph();
    // biome-ignore lint/complexity/noForEach: <explanation>
    g.getNodes().forEach(node => {
      const model = node.getModel();
      if ((model.entity as { entity_id: string })?.entity_id === state.nodeEntityId.value) {
        state.nodeDetail.value = model;
        state.detailType.value = 'node';
        const { edges = [], nodes = [] } = topoData.topoRawDataCache.value.complete;
        state.curLinkedEdges.value = topoData.filterEdges(edges, nodes, model.id);
      }
    });
  };

  /** 打开资源拓朴 */
  const handleViewResource = ({ sourceNode, node }) => {
    const g = graph();
    const t = g6Tooltip();
    if (!state.showResourceGraph.value) {
      state.showResourceGraph.value = !state.showResourceGraph.value;
    } else {
      const node = g.findById(sourceNode.id);
      g.setItemState(node, 'running', true);
    }
    // 如果之前有选中的节点(resourceNodeId.value存在)且不是当前节点，则取消其 'running' 状态
    if (state.resourceNodeId.value && state.resourceNodeId.value !== sourceNode.id) {
      const node = g.findById(state.resourceNodeId.value);
      g.setItemState(node, 'running', false);
    }
    // 保存当前选中节点的ID
    state.resourceNodeId.value = sourceNode.id;
    state.nodeEntityId.value = node?.entity?.entity_id || node?.model?.entity?.entity_id;
    state.nodeEntityName.value = node?.entity?.entity_name || node?.model?.entity?.entity_name;
    state.nodeDetail.value = sourceNode;
    t.hide();
    emit('changeSelectNode', sourceNode.id);
  };

  // ---------------------------------------------------------------------------
  // 反馈根因交互
  // ---------------------------------------------------------------------------

  /** 反馈根因 API 调用 */
  const feedbackIncidentRootApi = (isCancel = false) => {
    const { id, incident_id, bk_biz_id } = state.incidentDetailData.value;
    const params = {
      id,
      incident_id,
      bk_biz_id,
      feedback: {
        incident_root: state.feedbackModel.value.entity.entity_id,
        content: '',
      },
    };
    if (isCancel) {
      (params as any).is_cancel = true;
    }
    feedbackIncidentRoot(params).then(async () => {
      Message({
        theme: 'success',
        message: state.t('取消反馈成功'),
      });
      await topoData.getGraphData();
      renderGraphAccess.renderGraphCallback();

      // 刷新节点概览数据
      setTimeout(() => {
        handleViewServiceFromTop();
      }, 500);
    });
  };

  /** 反馈新根因，反馈后需要重新调用接口拉取数据 */
  const handleFeedBack = model => {
    const t = g6Tooltip();
    state.tooltipCompRef.value?.hide?.();
    t?.hide?.();
    state.feedbackModel.value = model;
    if (model.is_feedback_root) {
      feedbackIncidentRootApi(true);
      return;
    }
    state.feedbackCauseShow.value = true;
  };

  /** 根因变化 */
  const handleFeedBackChange = async () => {
    await topoData.getGraphData();
    renderGraphAccess.renderGraphCallback();
    state.feedbackCauseShow.value = false;

    // 刷新节点概览数据
    setTimeout(() => {
      handleViewServiceFromTop();
    }, 500);
  };

  // ---------------------------------------------------------------------------
  // 聚合配置交互
  // ---------------------------------------------------------------------------

  /** 聚合规则变化 */
  const handleUpdateAggregateConfig = async config => {
    topoData.aggregateConfig.value = config.aggregate_config ?? {};
    topoData.autoAggregate.value = config.auto_aggregate;
    topoData.aggregateCall.value = config.aggregate_call ?? true;
    topoData.aggregateVersion.value = config.aggregate_version ?? false;
    await topoData.getGraphData();
    renderGraphAccess.renderGraphCallback();
  };

  // ---------------------------------------------------------------------------
  // 缩放交互
  // ---------------------------------------------------------------------------

  const handleResetZoom = () => {
    const g = graph();
    state.zoomValue.value = 10;
    g.zoomTo(1);
    g.moveTo(0, 0);
    localStorage.setItem('failure-topo-zoom', String(state.zoomValue.value));
  };

  /** 画布缩放 */
  const handleZoomChange = value => {
    const g = graph();
    if (g?.zoomTo) {
      g.zoomTo(value / 10);
      localStorage.setItem('failure-topo-zoom', String(value));
      state.zoomValue.value = value;
    }
  };

  const handleUpdateZoom = val => {
    if (state.isPlay.value) {
      return;
    }
    const value = Math.max(MIN_ZOOM, state.zoomValue.value + Number(val));
    state.zoomValue.value = state.zoomValue.value + Number(val);
    handleZoomChange(value);
  };

  // ---------------------------------------------------------------------------
  // UI 控制交互
  // ---------------------------------------------------------------------------

  /** 收起查看资源 或者 节点/边概览 */
  const handleCollapseChange = (isResourceGraph = false) => {
    if (isResourceGraph) {
      state.showResourceGraph.value = false;
    } else {
      state.showServiceOverview.value = false;
    }
    state.resourceEdgeId.value = '';
  };

  /** 图例展示 */
  const handleShowLegend = () => {
    state.showLegend.value = !state.showLegend.value;
    localStorage.setItem('showLegend', String(state.showLegend.value));
  };

  /** 右侧资源图 tips 打开时，左侧 tips 关闭 */
  const handleHideToolTips = () => {
    const t = g6Tooltip();
    state.tooltipCompRef?.value?.hide?.();
    t?.hide?.();
  };

  /** 关闭左侧 tips */
  const handleHideTooltips = () => {
    const t = g6Tooltip();
    state.tooltipCompRef.value?.hide?.();
    t?.hide?.();
  };

  // ---------------------------------------------------------------------------
  // 详情跳转交互
  // ---------------------------------------------------------------------------

  const handleToDetailSlider = node => {
    state.detailInfo.value = node;
    const alarmData = cloneDeep(node);
    alarmData.nodeId = node.id;
    alarmData.id = node.alert_ids[0];
    // window.__BK_WEWEB_DATA__?.showDetailSlider?.(alarmData);
    alarmData.id &&
      state.updateAlarmDetailData({
        bk_biz_id: alarmData.bk_biz_id ?? window.cc_biz_id ?? window.bk_biz_id,
        id: alarmData.id,
      });
  };

  const handleRootToSpan = () => {
    const rootNode = topoData.topoRawData.value.nodes.find(node => node.entity.is_root);
    rootNode && goToTracePage(rootNode.entity, 'traceDetail');
  };

  /** 跳转 trace 检索页 */
  const goToTracePage = (entity: IEntity, type: string) => {
    const { origin, pathname } = window.location;
    const baseUrl = state.bkzIds.value[0] ? `${origin}${pathname}?bizId=${state.bkzIds.value[0]}` : '';

    // 选择对应的链接处理器
    const linkHandleByType = typeToLinkHandle.SpanExplore;
    // 获取查询参数
    const query = linkHandleByType.query(entity, type);

    const queryString = Object.keys(query)
      .map(key => `${key}=${query[key]}`)
      .join('&');
    window.open(`${baseUrl}#${linkHandleByType.path()}?${queryString}`, '_blank');
  };

  const handleToDetailTab = node => {
    const { alert_display, alert_ids } = node;
    const name = alert_display?.alert_name || '';
    const len = alert_ids.length;
    const alertObj = {
      ids: `告警ID: ${alert_ids.join(' OR 告警ID: ')}`,
      label: `${name} 等共 ${len} 个告警`,
    };
    emit('toDetailTab', alertObj);
  };

  return {
    // 导航计算属性
    navSelectNode,
    // 辅助函数（供 initGraph / renderGraph 使用）
    getCanvasByPoint,
    moveComboLabelPosition,
    toFrontAnomalyEdge,
    clearEdgeState,
    clearAllStats,
    MIN_ZOOM,
    // 节点详情 tooltip
    handleNodeInfoTooltip,
    // 边高亮交互
    setHighlightEdge,
    handleHighlightEdge,
    // 服务概览 / 资源拓扑交互
    handleViewServiceFromTopo,
    handleViewServiceFromResource,
    handleViewServiceFromTop,
    handleViewResource,
    // 反馈根因交互
    handleFeedBack,
    handleFeedBackChange,
    // 聚合配置交互
    handleUpdateAggregateConfig,
    // 缩放交互
    handleResetZoom,
    handleZoomChange,
    handleUpdateZoom,
    // UI 控制交互
    handleCollapseChange,
    handleShowLegend,
    handleHideToolTips,
    handleHideTooltips,
    // 详情跳转交互
    handleToDetailSlider,
    handleRootToSpan,
    goToTracePage,
    handleToDetailTab,
  };
}
