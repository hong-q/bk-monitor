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
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
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
import { defineComponent, onMounted, onUnmounted, toRef, watch } from 'vue';

import { Loading, Popover, Slider } from 'bkui-vue';

import DataAccess from '../../../components/data-access';
import ExceptionComp from '../../../components/exception';
import ResourceGraph from '../resource-graph/resource-graph';
import { useTopoData } from './composables/use-topo-data';
import { useTopoGraph } from './composables/use-topo-graph';
import { useTopoInteraction } from './composables/use-topo-interaction';
import { useTopoState } from './composables/use-topo-state';
import { useTopoTimeline } from './composables/use-topo-timeline';
import { useTopoTooltip } from './composables/use-topo-tooltip';
import FailureTopoDetail from './detail/failure-topo-detail';
import FeedbackCauseDialog from './feedback-cause-dialog';
import LegendPopoverContent from './legend/legend-popover-content';
import TopoTools from './toolbar/topo-tools';
import FailureTopoTooltips from './tooltip/failure-topo-tooltips';

import './failure-topo.scss';

export default defineComponent({
  name: 'FailureTopo',
  props: {
    selectNode: {
      type: Array,
      default: () => {
        return [];
      },
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['toDetail', 'playing', 'toDetailTab', 'changeSelectNode', 'refresh', 'closeCollapse'],
  setup(props, { emit }) {
    const {
      t,
      bkzIds,
      incidentDetailData,
      incidentId,
      updateAlarmDetailData,
      wrapRef,
      topoGraphRef,
      graphRef,
      topoTools,
      tooltipCompRef,
      resourceGraphRef,
      graphInstanceRef,
      g6TooltipRef,
      resizeCacheCallback,
      detailInfo,
      cacheResize,
      refreshTime,
      rootComboMovePoint,
      loading,
      errorData,
      isRenderComplete,
      zoomValue,
      showLegend,
      showServiceOverview,
      showResourceGraph,
      tooltipsModel,
      tooltipsEdge,
      edgeDetail,
      isClickEdgeItem,
      nodeDetail,
      curLinkedEdges,
      tooltipsType,
      detailType,
      showViewResource,
      timelinePosition,
      isPlay,
      feedbackCauseShow,
      feedbackModel,
      nodeEntityId,
      nodeEntityName,
      resourceNodeId,
      resourceEdgeId,
      dataAccessSpaceList,
      topoStatus,
      getTopoWidth,
    } = useTopoState(props);

    // 数据 composable
    const {
      topoRawDataCache,
      topoRawData,
      autoAggregate,
      aggregateConfig,
      aggregateCall,
      aggregateVersion,
      resolveLayout,
      getGraphData,
      registerInitGraphCallback,
      cleanupData,
      handleChangeRefleshTime,
      clearRefreshTimeout,
      moveToCenterIfNeeded,
      filterEdges,
      findEdges,
    } = useTopoData(
      {
        incidentId,
        wrapRef,
        loading,
        errorData,
        refreshTime,
        timelinePosition,
        resourceNodeId,
        nodeEntityId,
        nodeEntityName,
        isPlay,
      },
      { getGraph: () => graphInstanceRef.value }
    );

    // renderGraph 前向引用（useTopoGraph 在 interaction 之后调用，但 interaction 需要 renderGraphCallback）
    let renderGraphFn: (data?: any, renderComplete?: boolean) => void = () => {};

    // 交互 composable
    const {
      MIN_ZOOM,
      navSelectNode,
      getCanvasByPoint,
      moveComboLabelPosition,
      toFrontAnomalyEdge,
      clearEdgeState,
      clearAllStats,
      handleNodeInfoTooltip,
      setHighlightEdge,
      handleHighlightEdge,
      handleViewServiceFromTopo,
      handleViewServiceFromResource,
      handleViewServiceFromTop,
      handleViewResource,
      handleFeedBack,
      handleFeedBackChange,
      handleUpdateAggregateConfig,
      handleResetZoom,
      handleZoomChange,
      handleUpdateZoom,
      handleCollapseChange,
      handleShowLegend,
      handleHideToolTips,
      handleHideTooltips,
      handleToDetailSlider,
      handleRootToSpan,
      goToTracePage,
      handleToDetailTab,
    } = useTopoInteraction(
      {
        selectNode: toRef(props, 'selectNode'),
        t,
        bkzIds,
        incidentDetailData,
        updateAlarmDetailData,
        tooltipCompRef,
        resourceGraphRef,
        graphRef,
        zoomValue,
        showLegend,
        showServiceOverview,
        showResourceGraph,
        tooltipsModel,
        tooltipsEdge,
        edgeDetail,
        isClickEdgeItem,
        nodeDetail,
        curLinkedEdges,
        tooltipsType,
        detailType,
        showViewResource,
        feedbackCauseShow,
        feedbackModel,
        nodeEntityId,
        nodeEntityName,
        resourceNodeId,
        resourceEdgeId,
        detailInfo,
        resizeCacheCallback,
        timelinePosition,
        isPlay,
        rootComboMovePoint,
      },
      {
        topoRawDataCache,
        topoRawData,
        autoAggregate,
        aggregateConfig,
        aggregateCall,
        aggregateVersion,
        getGraphData,
        filterEdges,
        findEdges,
        handleChangeRefleshTime,
        moveToCenterIfNeeded,
      },
      { getGraph: () => graphInstanceRef.value },
      { getTooltip: () => g6TooltipRef.value },
      { renderGraphCallback: (...args: any[]) => renderGraphFn(...args) },
      emit
    );

    // 时间轴播放 composable
    const { handleResetPlay, handlePlay, handleTimelineChange, onAnimationStateChange, cleanupTimeline } =
      useTopoTimeline(
        {
          isPlay,
          showResourceGraph,
          showServiceOverview,
          timelinePosition,
          resourceNodeId,
          refreshTime,
          resizeCacheCallback,
          topoRawDataCache,
        },
        {
          clearRefreshTimeout,
          handleChangeRefleshTime,
          findEdges,
        },
        { getGraph: () => graphInstanceRef.value },
        emit
      );

    const handleToDetail = (node: any) => emit('toDetail', node);

    const refresh = () => emit('refresh');

    // Tooltip composable
    const {
      registerCustomTooltip,
      initComboLabelTooltip,
      initNodeInfoTooltip,
      handleComboMouseEnter,
      handleComboMouseLeave,
      hideComboLabelTooltip,
      handleNodeMouseEnter,
      handleNodeMouseLeave,
      handleTooltipChange,
      hideG6Tooltip,
    } = useTopoTooltip(
      {
        tooltipsModel,
        tooltipsEdge,
        edgeDetail,
        isClickEdgeItem,
        tooltipsType,
        tooltipCompRef,
        showResourceGraph,
        resourceGraphRef,
      },
      { topoRawDataCache },
      { handleViewServiceFromTopo, handleNodeInfoTooltip },
      {
        setTooltip: (t: any) => {
          g6TooltipRef.value = t;
        },
        getTooltip: () => g6TooltipRef.value,
      },
      { getGraph: () => graphInstanceRef.value }
    );

    // Graph 初始化 + 操作 composable
    const { initGraph, renderGraph, cleanupGraph } = useTopoGraph(
      {
        graphInstanceRef,
        g6TooltipRef,
        graphRef,
        resizeCacheCallback,
        cacheResize,
        isPlay,
        isRenderComplete,
        zoomValue,
        resourceNodeId,
        resourceEdgeId,
        rootComboMovePoint,
        timelinePosition,
        tooltipCompRef,
        topoRawDataCache,
        bkzIds,
        incidentDetailData,
      },
      {
        topoRawData,
        resolveLayout,
        moveToCenterIfNeeded,
      },
      {
        MIN_ZOOM,
        navSelectNode,
        getCanvasByPoint,
        moveComboLabelPosition,
        toFrontAnomalyEdge,
        clearEdgeState,
        clearAllStats,
        setHighlightEdge,
        handleZoomChange,
        handleFeedBack,
      },
      {
        handleTimelineChange,
        onAnimationStateChange,
      },
      {
        registerCustomTooltip,
        initComboLabelTooltip,
        initNodeInfoTooltip,
        handleComboMouseEnter,
        handleComboMouseLeave,
        hideComboLabelTooltip,
        handleNodeMouseEnter,
        handleNodeMouseLeave,
        handleTooltipChange,
        hideG6Tooltip,
      }
    );

    // 赋值前向引用（renderGraph 在 useTopoGraph 返回后才可用）
    renderGraphFn = renderGraph;

    onMounted(() => {
      if (topoStatus.value === 'normal') {
        registerInitGraphCallback(initGraph);
        getGraphData();
      }
    });

    watch(
      () => topoStatus.value,
      val => {
        if (val === 'normal') {
          registerInitGraphCallback(initGraph);
          getGraphData();
        }
      }
    );

    onUnmounted(() => {
      cleanupGraph();
      clearRefreshTimeout();
      cleanupTimeline();
      cleanupData();
    });

    /** 右侧资源拓扑、节点/边概览侧滑同时打开时，关闭左侧侧滑 */
    watch(
      () => [showServiceOverview.value, showResourceGraph.value],
      ([showService, showResource]) => {
        if (showService && showResource) {
          emit('closeCollapse', true);
        }
        if (!showService) {
          resourceEdgeId.value = '';
        }
      }
    );

    /** 左侧菜单选中联动 */
    watch(
      () => props.selectNode,
      val => {
        if (val.length) {
          const graph = graphInstanceRef.value;
          if (!graph) return;
          /** 清除之前节点状态 */
          // biome-ignore lint/complexity/noForEach: <explanation>
          graph.findAllByState('node', 'running').forEach?.(node => {
            graph.setItemState(node, 'running', false);
          });
          navSelectNode.value?.map?.((item, index) => {
            /** 多个节点只设置第一个节点为资源图节点 */
            if (index === 0) {
              if (item.entityId !== nodeEntityId.value) {
                showResourceGraph.value = false;
                showServiceOverview.value = false;
                resourceNodeId.value = item.id;
                nodeEntityId.value = item.entityId;
                nodeEntityName.value = item.entity_name;
              }
              moveToCenterIfNeeded(
                graph,
                resourceNodeId.value,
                graphRef.value!.clientWidth,
                graphRef.value!.clientHeight
              );
            }
            graph.setItemState(graph.findById(item.id), 'running', true);
          });
        }
      }
    );

    /** 右侧资源拓扑、节点/边概览侧滑同时打开时，打开左侧侧滑，关闭节点/边概览侧滑 */
    watch(
      () => props.isCollapsed,
      val => {
        if (!val && showServiceOverview.value && showResourceGraph.value) {
          showServiceOverview.value = false;
        }
      }
    );

    return {
      isPlay,
      nodeEntityId,
      topoTools,
      showResourceGraph,
      showServiceOverview,
      timelinePosition,
      topoGraphRef,
      tooltipsEdge,
      edgeDetail,
      isClickEdgeItem,
      graphRef,
      loading,
      zoomValue,
      resourceGraphRef,
      tooltipCompRef,
      wrapRef,
      showLegend,
      tooltipsModel,
      nodeDetail,
      feedbackCauseShow,
      feedbackModel,
      resourceNodeId,
      topoRawDataCache,
      tooltipsType,
      detailType,
      errorData,
      nodeEntityName,
      detailInfo,
      getTopoWidth,
      curLinkedEdges,
      refreshTime,
      showViewResource,
      topoStatus,
      bkzIds,
      dataAccessSpaceList,
      incidentDetailData,
      handleToDetail,
      handleHideToolTips,
      handleRootToSpan,
      handleFeedBackChange,
      handleFeedBack,
      handleShowLegend,
      handleViewResource,
      handleViewServiceFromResource,
      handleViewServiceFromTop,
      handleViewServiceFromTopo,
      handleUpdateZoom,
      handleZoomChange,
      handleResetZoom,
      handleUpdateAggregateConfig,
      handleChangeRefleshTime,
      handleTimelineChange,
      handlePlay,
      handleResetPlay,
      handleToDetailSlider,
      setHighlightEdge,
      handleToDetailTab,
      refresh,
      goToTracePage,
      t,
      handleCollapseChange,
      handleHighlightEdge,
      handleHideTooltips,
    };
  },
  render() {
    return (
      <div
        id='failure-topo'
        ref='wrapRef'
        class={[
          'failure-topo',
          this.isPlay && 'failure-topo-play',
          this.topoStatus === 'empty' && 'failure-topo-empty',
        ]}
      >
        {this.topoStatus === null ? null : this.topoStatus === 'empty' && this.dataAccessSpaceList?.length ? (
          <DataAccess
            showEnableButton={false}
            spaceList={this.dataAccessSpaceList}
            wxCsLink={this.incidentDetailData.wx_cs_link}
            isDarkTheme
          />
        ) : (
          <>
            <TopoTools
              ref='topoTools'
              v-model:showResource={this.showResourceGraph}
              v-model:showService={this.showServiceOverview}
              timelinePlayPosition={this.timelinePosition}
              topoRawDataList={this.topoRawDataCache.diff}
              onChangeRefleshTime={this.handleChangeRefleshTime}
              onPlay={this.handleResetPlay}
              onShowService={this.handleViewServiceFromTop}
              onTimelineChange={this.handleTimelineChange}
              onUpdate:AggregationConfig={this.handleUpdateAggregateConfig}
            />
            <Loading
              class='failure-topo-loading'
              color='#292A2B'
              loading={this.loading}
            >
              <div
                ref='topoGraphRef'
                class='topo-graph-wrapper'
              >
                <div
                  style={{ width: this.getTopoWidth }}
                  class='topo-graph-wrapper-padding'
                >
                  {this.errorData.isError || this.errorData.isNoData ? (
                    <ExceptionComp
                      errorMsg={this.errorData.msg}
                      imgHeight={100}
                      isDarkTheme={true}
                      isError={this.errorData.isError}
                      title={this.errorData.isError ? this.t('查询异常') : this.t('暂无数据')}
                    />
                  ) : (
                    <>
                      <div
                        id='topo-graph'
                        ref='graphRef'
                        class='topo-graph'
                      />
                      <div class='failure-topo-graph-zoom'>
                        <Popover
                          extCls='failure-topo-graph-legend-popover'
                          v-slots={{
                            content: <LegendPopoverContent />,
                            default: (
                              <div
                                class={[
                                  'failure-topo-graph-legend',
                                  this.showLegend && 'failure-topo-graph-legend-active',
                                ]}
                                v-bk-tooltips={{
                                  content: this.t('显示图例'),
                                  disabled: this.showLegend,
                                  boundary: this.wrapRef,
                                }}
                                onClick={this.handleShowLegend}
                              >
                                <i class='icon-monitor icon-legend' />
                              </div>
                            ),
                          }}
                          always={true}
                          arrow={false}
                          boundary='body'
                          disabled={!this.showLegend}
                          isShow={this.showLegend}
                          offset={{ crossAxis: 90, mainAxis: 10 }}
                          placement='top'
                          renderType='auto'
                          theme='dark common-table'
                          trigger='manual'
                          zIndex={100}
                        />
                        <span class='failure-topo-graph-line' />
                        <div class='failure-topo-graph-zoom-slider'>
                          <div
                            class={['failure-topo-graph-setting', { disabled: this.isPlay }]}
                            onClick={this.handleUpdateZoom.bind(this, -2)}
                          >
                            <i class='icon-monitor icon-minus-line' />
                          </div>
                          <Slider
                            class='slider'
                            v-model={this.zoomValue}
                            disable={this.isPlay}
                            maxValue={20}
                            minValue={2}
                            onChange={this.handleZoomChange}
                            onUpdate:modelValue={this.handleZoomChange}
                          />
                          <div
                            class={['failure-topo-graph-setting', { disabled: this.isPlay }]}
                            onClick={this.handleUpdateZoom.bind(this, 2)}
                          >
                            <i class='icon-monitor icon-plus-line' />
                          </div>
                        </div>
                        <span class='failure-topo-graph-line' />
                        <div
                          class={['failure-topo-graph-proportion', { disabled: this.isPlay }]}
                          v-bk-tooltips={{ content: this.t('重置比例'), boundary: this.wrapRef, zIndex: 999999 }}
                          onClick={this.handleResetZoom}
                        >
                          <i class='icon-monitor icon-mc-restoration-ratio' />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {this.showResourceGraph && !this.isPlay && (
                  <ResourceGraph
                    ref='resourceGraphRef'
                    entityId={this.nodeEntityId}
                    entityName={this.nodeEntityName}
                    modelData={this.topoRawDataCache.complete}
                    resourceNodeId={this.resourceNodeId}
                    onCollapseResource={this.handleCollapseChange}
                    onHideToolTips={this.handleHideToolTips}
                    onViewService={this.handleViewServiceFromResource}
                  />
                )}
                {this.showServiceOverview && !this.isPlay && (
                  <FailureTopoDetail
                    edge={this.edgeDetail}
                    isClickEdgeItem={this.isClickEdgeItem}
                    linkedEdges={this.curLinkedEdges}
                    model={this.nodeDetail}
                    refreshTime={this.refreshTime}
                    showServiceOverview={this.showServiceOverview}
                    showViewResource={this.showViewResource}
                    type={this.detailType}
                    onClearHighlightEdge={this.setHighlightEdge.bind(this)}
                    onCollapseService={this.handleCollapseChange}
                    onFeedBack={this.handleFeedBack}
                    onHighlightEdge={this.handleHighlightEdge}
                    onToDetail={this.handleToDetail}
                    onToDetailSlider={this.handleToDetailSlider}
                    onToDetailTab={this.handleToDetailTab}
                    onToTracePage={this.goToTracePage}
                  />
                )}
              </div>
            </Loading>
          </>
        )}
        <FeedbackCauseDialog
          data={this.feedbackModel}
          visible={this.feedbackCauseShow}
          onEditSuccess={this.handleFeedBackChange}
          onRefresh={this.refresh}
          onUpdate:isShow={(val: boolean) => {
            this.feedbackCauseShow = val;
          }}
        />
        <div style='display: none'>
          <FailureTopoTooltips
            ref='tooltipCompRef'
            edge={this.tooltipsEdge}
            model={this.tooltipsModel}
            type={this.tooltipsType}
            onHide={this.handleHideTooltips}
            onViewResource={this.handleViewResource}
            onViewService={this.handleViewServiceFromTopo}
          />
        </div>
        <div
          id='combo-label-tooltip'
          class='combo-label-tooltip'
        />
        <div
          id='node-detail-tips'
          class='node-detail-tips'
        />
      </div>
    );
  },
});
