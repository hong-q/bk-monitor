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
import {
  type Ref,
  computed,
  defineComponent,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  shallowRef,
  watch,
} from 'vue';

import { bkTooltips, Collapse, Dropdown, Exception, Loading, Message, Sideslider } from 'bkui-vue';
import { getPanelDetail, incidentDiagnosis } from 'monitor-api/modules/incident';
import { copyText } from 'monitor-common/utils';
import { useI18n } from 'vue-i18n';
import VueJsonPretty from 'vue-json-pretty';
import { useRoute } from 'vue-router';

import MarkdownViewer from '../../../components/markdown-editor/viewer';
import EventTable from '../../alarm-center/common-detail/components/panel-event/components/event-table';
import LogTableNew from '../../alarm-center/common-detail/components/panel-log/log-table/log-table-new';
import TableFieldSetting from '../../alarm-center/common-detail/components/panel-log/log-table/table-field-setting';
import {
  type TClickMenuOpt,
  EClickMenuType,
} from '../../alarm-center/common-detail/components/panel-log/log-table/typing';
import { EVENTS_TYPE_MAP } from '../constant';
import { checkOverflow } from '../utils';
import { replaceEntityInText } from './entity-replace';
import { createShootingModule } from './shooting-module';
import { normalizeEventTableRow } from './utils';

import type { IncidentDetailData } from '../failure-topo/types';
import type {
  IAlertData,
  IContentList,
  IEventsAnalysis,
  IEventsContentsData,
  IExtractedInfoList,
  IInteraction,
  IListItem,
  IStrategyMapItem,
  ISummaryList,
  OverflowPopType,
} from '../types';
import type { IOpenDrawerContext } from './interaction-handler';

import './trouble-shooting.scss';

export default defineComponent({
  name: 'TroubleShooting',
  directives: {
    bkTooltips,
  },
  props: {
    panelConfig: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ['alertList', 'strategy'],
  setup(props, { emit }) {
    const { t } = useI18n();
    const route = useRoute();
    const isAllCollapsed = shallowRef(true);
    const contentList: IContentList = reactive({});
    // 总结信息汇总
    const summaryList: ISummaryList = reactive({});
    // 实体信息映射 - 按 sub_panel 存储 extracted_info
    const extractedInfoList: IExtractedInfoList = reactive({});
    // 各模块 display 层的交互配置，例如告警异常维度“查看全部”
    const displayInteractionList = reactive<Record<string, IInteraction | undefined>>({});
    // 事件分析数据整理
    const eventsData = shallowRef<IEventsAnalysis[]>([]);
    const loadingList = reactive({
      summary: false,
      suggestion: false,
      alerts_analysis: false,
      events_analysis: false,
      logs_analysis: false,
    });
    // 当前展开的各模块Collapse索引
    const activeIndex = reactive<{
      dimensional: number[];
      event: number[];
      eventChild: Record<string, number[]>;
      log: number[];
      trace: number[];
    }>({
      dimensional: [0],
      event: [0],
      eventChild: {},
      log: [0],
      trace: [0],
    });
    const bkzIds = inject<Ref<string[]>>('bkzIds');
    const incidentDetail = inject<Ref<IncidentDetailData>>('incidentDetail');
    const incidentDetailData: Ref<IncidentDetailData> = computed(() => {
      return incidentDetail.value;
    });
    // 是否展示详情侧边栏
    const showSideSlider = shallowRef(false);
    // 当前选中的card
    const curSliderId = shallowRef('');
    // 是否展示 JSON 详情侧滑
    const showJsonSideslider = shallowRef(false);
    // 当前查看的完整 JSON 数据
    const currentJsonData = shallowRef<any>(null);
    // 当前查看的完整 JSON 数据索引
    const currentJsonDataIndex = shallowRef<number>(null);
    // JSON 查看器渲染标记，用于强制重新渲染重置折叠状态
    const jsonViewerRendered = shallowRef(true);
    // 是否展示全部子事件侧滑
    const showAllEventsSideslider = shallowRef(false);
    // 当前查看全部子事件的父级事件数据
    const currentAllEventsItem = shallowRef<IEventsAnalysis | null>(null);
    // 是否展示日志侧滑（日志侧滑详情当前暂不联调接入）
    const showLogSideslider = shallowRef(false);
    // 当前详情侧滑上下文及分页缓存，detail_ref 始终原样回传
    const currentDrawerContext = shallowRef<IOpenDrawerContext | null>(null);
    const drawerPayloadCache = new Map<string, Promise<Record<string, any>>>();
    const drawerRenderKey = shallowRef(0);
    // 侧滑详情请求错误信息
    const drawerErrorMessage = shallowRef('');
    const displayColumnFields = shallowRef<string[]>([]);
    const tableColumnsSetting = shallowRef<Array<{ id: string; name: string; type?: string }>>([]);
    const logTableRefreshKey = shallowRef('');

    /** 获取侧滑详情数据，同一侧滑同一页只发起一次请求 */
    const fetchDrawerPayload = (page: number, pageSize: number) => {
      const context = currentDrawerContext.value;
      if (!context?.detailRef) {
        return Promise.resolve({});
      }

      const cacheKey = `${context.drawerType}:${page}:${pageSize}`;
      if (!drawerPayloadCache.has(cacheKey)) {
        // incident_id 必须使用 BKFara 故障 ID，禁止回退到 URL 文档 ID
        const incidentId = Number(incidentDetailData.value?.incident_id);
        // incident_task_id 优先取 detail_ref，其次路由/extra_info
        const incidentTaskId =
          context.detailRef.incident_task_id ??
          route.query.incident_task_id ??
          incidentDetailData.value?.extra_info?.task_id;

        if (!incidentId || !incidentTaskId) {
          const message = t('缺少故障分析任务信息，无法打开详情');
          drawerErrorMessage.value = message;
          return Promise.reject(new Error(message));
        }

        const requestParams = {
          bk_biz_id: Number(bkzIds.value[0]),
          incident_id: incidentId,
          incident_task_id: Number(incidentTaskId),
          drawer_type: context.drawerType,
          // detail_ref 必须与诊断结果完全一致，禁止增删改字段
          detail_ref: context.detailRef,
          page,
          page_size: pageSize,
        };
        const requestPromise = getPanelDetail(requestParams)
          .then(res => {
            // 请求封装已解包 Resource 标准响应的 data 层
            if (res?.drawer_type && res.drawer_type !== context.drawerType) {
              throw new Error(t('侧滑详情类型不匹配'));
            }
            drawerErrorMessage.value = '';
            return res?.payload || {};
          })
          .catch(err => {
            drawerPayloadCache.delete(cacheKey);
            const message = err?.message || t('获取侧滑详情失败');
            drawerErrorMessage.value = message;
            Message({
              message,
              theme: 'error',
            });
            throw err;
          });
        drawerPayloadCache.set(cacheKey, requestPromise);
      }
      return drawerPayloadCache.get(cacheKey);
    };

    /** 日志表格字段元数据直接消费详情接口 payload（日志侧滑暂不联调） */
    const getLogFieldsData = async () => {
      const payload = await fetchDrawerPayload(1, 30);
      const fields = payload.fields || [];
      const payloadDisplayFields =
        payload.user_custom_config?.displayFields || payload.display_fields || fields.map(item => item.field_name);
      displayColumnFields.value = payloadDisplayFields;
      tableColumnsSetting.value = fields.map(item => ({
        id: item.field_name,
        name: item.query_alias || item.field_name,
        type: item.field_type,
      }));
      return payload;
    };

    /** 根据 LogTableNew 的 offset 换算详情接口页码（日志侧滑暂不联调） */
    const getLogTableData = async ({ offset = 0, size = 30 }) => {
      return fetchDrawerPayload(Math.floor(offset / size) + 1, size);
    };
    // 字段设置确认回调（更新展示字段）
    const handleDisplayColumnFieldsChange = (val: string[]) => {
      displayColumnFields.value = val;
    };
    // 日志表格字段隐藏（expand-content 中 icon-mc-invisible 点击）
    const handleRemoveField = (fieldName: string) => {
      displayColumnFields.value = displayColumnFields.value.filter(item => item !== fieldName);
    };
    // 日志表格字段展示（expand-content 中 icon-mc-visual 点击）
    const handleAddField = (fieldName: string) => {
      if (displayColumnFields.value.includes(fieldName)) {
        return;
      }
      displayColumnFields.value = [...displayColumnFields.value, fieldName];
    };
    // 日志侧滑表格只允许"复制"菜单项
    const logAllowedMenuTypes = [EClickMenuType.Copy];
    // 日志表格右键菜单回调（处理复制逻辑）
    const handleLogClickMenu = (opt: TClickMenuOpt) => {
      if (opt.type === EClickMenuType.Copy) {
        copyText(opt.value, msg => {
          Message({
            message: msg,
            theme: 'error',
          });
          return;
        });
        Message({
          message: t('复制成功'),
          theme: 'success',
        });
      }
    };
    const MODULE_LIST = [
      {
        name: t('处置建议'),
        key: 'suggestion',
        icon: 'icon-chulijilu',
        id: 'panel-suggestion',
      },
      {
        name: t('告警异常维度分析'),
        key: 'alerts_analysis',
        icon: 'icon-dimension-line',
        id: 'panel-alerts_analysis',
      },
      {
        name: t('事件分析'),
        key: 'events_analysis',
        icon: 'icon-shijianjiansuo',
        id: 'panel-events_analysis',
      },
      {
        name: t('日志分析'),
        key: 'logs_analysis',
        icon: 'icon-a-logrizhi',
        id: 'panel-logs_analysis',
      },
      {
        name: t('Trace 分析'),
        key: 'trace_analysis',
        icon: 'icon-Tracing',
        id: 'panel-trace_analysis',
      },
    ];

    const AI_CONFIG = [
      {
        name: t('故障总结'),
        key: 'summary',
        id: 'panel-summary',
      },
    ];
    // 主内容区的弹窗状态管理
    const popoverState = reactive({
      // 当前显示的弹窗信息
      currentPopover: null as null | { index: number; type: OverflowPopType },
      // 所有项的溢出状态缓存，Record<string, boolean>
      overflowMap: {},
    });
    // 侧边栏的弹窗状态管理
    const sliderPopoverState = reactive({
      currentPopover: null as null | { index: number; type: OverflowPopType },
      overflowMap: {},
    });

    const subPanels = computed(() => props.panelConfig.sub_panels || {});
    const showList = computed(() => MODULE_LIST.filter(item => subPanels.value?.[item.key]?.enabled));

    // 跳转到告警tab带上策路ID过滤
    const goDetail = (data: IStrategyMapItem) => {
      emit('strategy', data);
    };

    // 跳转到告警tab
    const goAlertList = (list: IAlertData[]) => {
      emit('alertList', list);
    };

    // 创建弹窗处理函数工厂
    const createPopoverHandlers = (state: typeof popoverState) => {
      // 处理鼠标进入事件
      const handleMouseEnter = async (event: MouseEvent, index: number, type: OverflowPopType) => {
        if (!event.target) return;
        const target = event.currentTarget as HTMLElement;
        const popoverKey = `${type}_${index}`;

        // 检查是否已缓存溢出状态，如果没有则计算并缓存
        if (state.overflowMap[popoverKey] === undefined) {
          state.overflowMap[popoverKey] = checkOverflow(target);
        }
        // 只有文本溢出时才显示弹窗
        if (state.overflowMap[popoverKey]) {
          state.currentPopover = { type, index };
        }
      };

      // 手动关闭弹窗
      const handlePopoverClose = (item: { isShow: boolean }) => {
        // 只有点击弹窗外区域时才关闭弹窗
        if (!item.isShow) return;

        state.currentPopover = null;
      };

      // 响应窗口变化重新计算文本是否溢出
      const handleResize = () => {
        // 重新计算所有已缓存项的溢出状态
        for (const key of Object.keys(state.overflowMap)) {
          const [type, indexStr] = key.split('_');
          const index = Number(indexStr);
          const selectorMap = {
            demo_log: `.log-tips__demo_log[data-index="${index}"]`,
            log_pattern: `.log-tips__pattern[data-index="${index}"]`,
            trace_pattern: `.trace-tips__pattern[data-index="${index}"]`,
          };

          const selector = selectorMap[type];
          if (selector) {
            const el = document.querySelector(selector);
            if (el) {
              state.overflowMap[key] = checkOverflow(el as HTMLElement);
            }
          }
        }
      };

      return {
        handleMouseEnter,
        handlePopoverClose,
        handleResize,
      };
    };

    // 主内容区弹窗处理
    const mainPopoverHandlers = createPopoverHandlers(popoverState);
    // 侧边栏弹窗处理
    const sliderPopoverHandlers = createPopoverHandlers(sliderPopoverState);

    // 响应窗口变化重新计算文本是否溢出（只主内容区需要）
    const handleResize = () => {
      mainPopoverHandlers.handleResize();
    };

    onMounted(() => {
      window.addEventListener('resize', handleResize);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize);
    });

    const renderEmpty = (data: IListItem) => (
      <Exception
        class='exception-wrap-item'
        description={data.message}
        scene='part'
        title={t('查询异常')}
        type='500'
      />
    );

    const getIncidentDiagnosis = (key: string) => {
      loadingList[key] = true;
      incidentDiagnosis({
        bk_biz_ids: bkzIds.value,
        id: route.params.id,
        sub_panel: key,
      })
        .then(res => {
          if (key === 'events_analysis') {
            eventsData.value = Object.keys(res.contents).length
              ? (Object.entries(res.contents)
                  .map(([key, value]) => {
                    const fields = res.display?.fields[key] || {};
                    const labelConfig = res.display?.labels_mapping[key] || {};
                    const title = labelConfig.label || '';
                    return {
                      type: key,
                      title,
                      top: labelConfig.top || 0,
                      unit: labelConfig.unit || '',
                      total: res.display?.statistics[key]?.total || 0,
                      contents: (value as any as IEventsContentsData[]).slice(0, 3), // 只展示前3条
                      allContents: value,
                      fields,
                      interaction: labelConfig.interaction,
                      isGeneral: !(key in EVENTS_TYPE_MAP),
                    };
                  })
                  .filter(Boolean) as IEventsAnalysis[])
              : [];

            // 事件分析模块第二层Collapse默认展开第一条
            const newIndex: Record<string, number[]> = {};
            for (const [index, item] of eventsData.value.entries()) {
              if (item.contents?.length) {
                newIndex[index] = [0];
              }
            }
            activeIndex.eventChild = newIndex;
          } else if (key === 'trace_analysis') {
            contentList[key] = res.contents.trace_messages_analysis || [];
          } else {
            contentList[key] = res.contents || '';
          }
          summaryList[key] = res.individual_summary || '';
          extractedInfoList[key] = res.extracted_info || undefined;
          displayInteractionList[key] = res.display?.interaction;
          const { sub_panels } = props.panelConfig;
          loadingList[key] = sub_panels[key].status === 'running';
        })
        .catch(() => {
          contentList[key] = '';
          summaryList[key] = '';
          extractedInfoList[key] = undefined;
          displayInteractionList[key] = undefined;
          loadingList[key] = false;
        });
    };

    // 获取tab的展示内容
    const getTabContent = () => {
      const { status, sub_panels } = props.panelConfig;
      let keys = Object.keys(sub_panels);
      if (status === 'running') {
        keys = Object.keys(sub_panels || {}).filter(
          key => sub_panels[key].enabled && sub_panels[key].status === 'running'
        );
      }
      for (const key of keys) {
        getIncidentDiagnosis(key);
      }
    };

    watch(
      () => bkzIds.value,
      val => {
        val.length > 0 && getTabContent();
      }
    );
    watch(
      () => props.panelConfig,
      () => {
        bkzIds.value.length > 0 && getTabContent();
      },
      { deep: true, immediate: true }
    );

    const handleToPanel = (key: string) => {
      const id = `panel-${key}`;
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    };

    const toggleSlider = (id: string) => {
      curSliderId.value = id;
      showSideSlider.value = true;
    };

    // 查看完整 JSON 数据
    const onViewFullJson = (data: any, dataIndex: number) => {
      currentJsonData.value = data;
      currentJsonDataIndex.value = dataIndex;
      // 先销毁再重建 JSON 查看器，以重置折叠状态
      jsonViewerRendered.value = false;
      nextTick(() => {
        jsonViewerRendered.value = true;
        showJsonSideslider.value = true;
      });
    };

    // 查看全部子事件
    const onViewAllEvents = (item: IEventsAnalysis) => {
      currentAllEventsItem.value = item;
      showAllEventsSideslider.value = true;
    };

    /**
     * 多层 Sideslider 遮罩策略：
     * bkui-vue Modal 使用全局 mask 栈，打开新层会把上一层 mask 的 opacity 置 0；
     * 同一 mask 再次作为顶层打开时不会恢复为 1，表现为遮罩丢失。
     * 因此只让「当前最底层」侧滑持有遮罩，上层侧滑不再参与组件库 mask 栈。
     */
    const allEventsSliderShowMask = computed(() => !showSideSlider.value);
    const jsonSliderShowMask = computed(() => !showSideSlider.value && !showAllEventsSideslider.value);

    /**
     * 下层侧滑的 beforeClose：遮罩点击 / ESC 会落到下层 mask 上，
     * 此时应先关闭更上层，而不是把底层一起关掉。
     */
    const beforeCloseModuleSlider = () => {
      if (showJsonSideslider.value) {
        showJsonSideslider.value = false;
        return false;
      }
      if (showAllEventsSideslider.value) {
        showAllEventsSideslider.value = false;
        return false;
      }
      return true;
    };
    const beforeCloseAllEventsSlider = () => {
      if (showJsonSideslider.value) {
        showJsonSideslider.value = false;
        return false;
      }
      return true;
    };

    // 是否展示事件表格侧滑
    const showEventTableSideslider = shallowRef(false);
    /** 接收 shooting-module 的 drawer 交互并打开对应侧滑 */
    const onOpenDrawer = async (context: IOpenDrawerContext) => {
      // 日志侧滑详情暂未接入联调，直接忽略
      if (context.drawerType === 'log') {
        return;
      }
      currentDrawerContext.value = context;
      drawerPayloadCache.clear();
      drawerErrorMessage.value = '';
      drawerRenderKey.value += 1;
      displayColumnFields.value = [];
      tableColumnsSetting.value = [];
      logTableRefreshKey.value = String(drawerRenderKey.value);
      showLogSideslider.value = false;

      try {
        // 先拉取详情，确保错误态可在侧滑打开前捕获
        await fetchDrawerPayload(1, 30);
        showEventTableSideslider.value = context.drawerType === 'event';
      } catch {
        // 接口失败时仍打开侧滑展示错误态，禁止降级为页面跳转
        showEventTableSideslider.value = context.drawerType === 'event';
      }
    };

    /**
     * 事件表格直接消费 panel_detail 的 payload.list，
     * 不根据 query_config 再发起事件检索请求。
     */
    const getEventTableData = async (params: { limit: number; offset: number; sort: string[]; sources: string[] }) => {
      try {
        const payload = await fetchDrawerPayload(Math.floor(params.offset / params.limit) + 1, params.limit);
        const list = (payload.list || []).map((item, index) => normalizeEventTableRow(item, params.offset + index));
        return {
          data: list,
          // 分页总数优先使用 query_config.total
          total: payload.query_config?.total ?? payload.total ?? list.length,
        };
      } catch {
        return {
          data: [],
          total: 0,
        };
      }
    };

    return {
      t,
      bkzIds,
      incidentDetailData,
      isAllCollapsed,
      contentList,
      eventsData,
      displayInteractionList,
      summaryList,
      extractedInfoList,
      loadingList,
      showList,
      subPanels,
      AI_CONFIG,
      renderEmpty,
      handleToPanel,
      toggleSlider,
      curSliderId,
      showSideSlider,
      showJsonSideslider,
      currentJsonData,
      currentJsonDataIndex,
      jsonViewerRendered,
      onViewFullJson,
      showAllEventsSideslider,
      currentAllEventsItem,
      onViewAllEvents,
      showLogSideslider,
      showEventTableSideslider,
      currentDrawerContext,
      drawerRenderKey,
      drawerErrorMessage,
      onOpenDrawer,
      getEventTableData,
      displayColumnFields,
      tableColumnsSetting,
      logTableRefreshKey,
      getLogFieldsData,
      getLogTableData,
      handleDisplayColumnFieldsChange,
      handleRemoveField,
      handleAddField,
      logAllowedMenuTypes,
      handleLogClickMenu,
      popoverState,
      sliderPopoverState,
      activeIndex,
      goAlertList,
      goDetail,
      handleMouseEnter: mainPopoverHandlers.handleMouseEnter,
      handlePopoverClose: mainPopoverHandlers.handlePopoverClose,
      handleSliderMouseEnter: sliderPopoverHandlers.handleMouseEnter,
      handleSliderPopoverClose: sliderPopoverHandlers.handlePopoverClose,
      allEventsSliderShowMask,
      jsonSliderShowMask,
      beforeCloseModuleSlider,
      beforeCloseAllEventsSlider,
    };
  },
  render() {
    // 公共的故障诊断模块配置
    const getShootingModuleConfig = (type: 'main' | 'slider') => ({
      bkzIds: this.bkzIds,
      incidentDetailData: this.incidentDetailData,
      contentList: this.contentList,
      eventsData: this.eventsData,
      displayInteractionList: this.displayInteractionList,
      summaryList: this.summaryList,
      extractedInfoList: this.extractedInfoList,
      activeIndex: this.activeIndex,
      popoverState: type === 'main' ? this.popoverState : this.sliderPopoverState,
      handleMouseEnter: type === 'main' ? this.handleMouseEnter : this.handleSliderMouseEnter,
      handlePopoverClose: type === 'main' ? this.handlePopoverClose : this.handleSliderPopoverClose,
      goAlertList: this.goAlertList,
      goDetail: this.goDetail,
      onViewAllEvents: this.onViewAllEvents,
      onViewFullJson: this.onViewFullJson,
      onOpenDrawer: this.onOpenDrawer,
    });

    // 缓存主内容区和侧边栏的shooting modules
    const [mainShootingModule, sliderShootingModule] = ['main', 'slider'].map(type =>
      createShootingModule(getShootingModuleConfig(type as 'main' | 'slider'), this.t)
    );

    // 统一的title slot渲染
    const titleSlot = (item: IListItem) => (
      <div
        id={`panel-${item.key}`}
        class='failure-item-title'
      >
        <i class={`icon-monitor ${item.icon} title-icon-circle`} />
        <span class='field-name'>{item.name}</span>
      </div>
    );

    // 统一的content slot渲染
    const contentSlot = (item: IListItem, shootingModule: any) => {
      if (this.subPanels[item.key]?.status === 'failed') {
        return this.renderEmpty(this.subPanels[item.key]);
      }

      return (
        <Loading
          class={{ 'ai-card-loading': this.loadingList[item.key] }}
          loading={this.loadingList[item.key]}
        >
          {!this.loadingList[item.key] && shootingModule?.slots?.[item.key]?.()}
        </Loading>
      );
    };

    // AI卡片渲染逻辑
    const renderAICard = () => {
      if (this.subPanels.summary.status === 'failed') {
        return this.renderEmpty(this.subPanels.summary);
      }
      return (
        !this.loadingList.summary && (
          <MarkdownViewer
            class='markdown-viewer-has-link'
            value={replaceEntityInText(this.contentList?.summary, this.extractedInfoList?.summary)}
          />
        )
      );
    };

    return (
      <>
        <div class='failure-trouble-shooting'>
          <div class='trouble-shooting-header'>
            <Dropdown
              v-slots={{
                default: () => (
                  <span
                    class='collapse-handle-btn'
                    v-bk-tooltips={{
                      content: this.t('快速定位'),
                      placements: ['top'],
                    }}
                  >
                    <i class='icon-monitor icon-a-Contentmulu' />
                  </span>
                ),
                content: () => {
                  return (
                    <Dropdown.DropdownMenu>
                      {[...this.AI_CONFIG, ...this.showList].map(item => (
                        <Dropdown.DropdownItem
                          key={item.key}
                          extCls='text-active'
                          onClick={() => this.handleToPanel(item.key)}
                        >
                          {item.name}
                        </Dropdown.DropdownItem>
                      ))}
                    </Dropdown.DropdownMenu>
                  );
                },
              }}
              popoverOptions={{
                extCls: 'collapse-handle-popover',
                clickContentAutoHide: true,
              }}
              placement='bottom-end'
              trigger='click'
            />
          </div>
          <div class='trouble-shooting-main'>
            {/* AI故障总结卡片 */}
            {this.subPanels.summary?.enabled && (
              <div
                id='panel-summary'
                class='ai-card'
              >
                <i
                  class='icon-monitor icon-chakan1 independent-view-icon cursor-link'
                  v-bk-tooltips={this.t('独立查看')}
                  onClick={() => {
                    this.toggleSlider('panel-summary');
                  }}
                />
                <div class='ai-card-title'>
                  <span class='ai-card-title-icon' />
                  {this.t('故障总结')}
                </div>
                <Loading
                  class={{ 'ai-card-loading': this.loadingList.summary }}
                  color={'#f3f6ff'}
                  loading={this.loadingList.summary}
                >
                  <div class='ai-card-main'>
                    {renderAICard()}
                    {this.subPanels.summary.status !== 'failed' && <span class='ai-bot-bg' />}
                  </div>
                </Loading>
              </div>
            )}
            {/* 其他各模块卡片 */}
            {this.showList.length > 0 &&
              this.showList.map(item => {
                return (
                  <div
                    id={item.id}
                    key={item.id}
                    class='failure-item-wrapper'
                  >
                    {this.subPanels[item.key]?.status !== 'failed' && (
                      <i
                        class='icon-monitor icon-chakan1 independent-view-icon cursor-link'
                        v-bk-tooltips={this.t('独立查看')}
                        onClick={() => {
                          this.toggleSlider(item.id);
                        }}
                      />
                    )}
                    {titleSlot(item)}
                    <div class='failure-item-content'>{contentSlot(item, mainShootingModule)}</div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 独立查看模块侧滑：始终持有遮罩（它只会作为最底层打开） */}
        <Sideslider
          width={640}
          extCls={'trouble-shooting-slider'}
          beforeClose={this.beforeCloseModuleSlider}
          isShow={this.showSideSlider}
          quickClose={true}
          showMask={true}
          zIndex={2500}
          onClosed={() => {
            this.showSideSlider = false;
          }}
        >
          {{
            header: () =>
              this.curSliderId === 'panel-summary'
                ? this.AI_CONFIG[0].name
                : this.showList.find(item => item.id === this.curSliderId).name,
            default: () => (
              <div class='trouble-shooting-main trouble-shooting-slider-main'>
                {this.curSliderId === 'panel-summary'
                  ? renderAICard()
                  : this.showList
                      .filter(item => item.id === this.curSliderId)
                      .map(item => (
                        <div
                          key={item.id}
                          class='failure-item-wrapper'
                        >
                          <div class='failure-item-content'>{contentSlot(item, sliderShootingModule)}</div>
                        </div>
                      ))}
              </div>
            ),
          }}
        </Sideslider>

        {/* 全部子事件侧滑：仅在从主内容打开时展示遮罩，叠加在独立查看之上时复用下层遮罩 */}
        <Sideslider
          width={640}
          extCls={'trouble-shooting-slider all-events-slider'}
          beforeClose={this.beforeCloseAllEventsSlider}
          isShow={this.showAllEventsSideslider}
          quickClose={true}
          showMask={this.allEventsSliderShowMask}
          zIndex={2600}
          onClosed={() => {
            this.showAllEventsSideslider = false;
          }}
        >
          {{
            header: () => (
              <div class='all-events-slider-header'>
                <span class='mr-2'>{this.currentAllEventsItem.title}</span>
                <span>
                  <i18n-t keypath='（共 {0} 个{1}）'>
                    <span>{this.currentAllEventsItem.total}</span>
                    <span>{this.currentAllEventsItem.unit}</span>
                  </i18n-t>
                </span>
              </div>
            ),
            default: () => {
              const item = this.currentAllEventsItem;
              if (!item) return null;
              // 确保当前项的展开状态已初始化（复用主内容区的逻辑）
              const itemIndex = item.$index ?? 0;
              if (this.activeIndex.eventChild[itemIndex] === undefined) {
                this.activeIndex.eventChild[itemIndex] = (item.allContents || []).map((_, i) => i);
              }
              return (
                <div class='all-events-slider-content'>
                  <Collapse
                    class='event-collapse inner-collapse'
                    v-model={this.activeIndex.eventChild[itemIndex]}
                    v-slots={{
                      default: subContent => sliderShootingModule.eventTitle(item, subContent),
                      content: subContent => sliderShootingModule.eventChildContent(item, subContent),
                    }}
                    header-icon='right-shape'
                    list={item.allContents || []}
                  />
                </div>
              );
            },
          }}
        </Sideslider>

        {/* JSON 完整数据侧滑：叠加打开时不创建新遮罩，避免组件库 mask 栈把 opacity 置 0 */}
        <Sideslider
          width={640}
          extCls={'trouble-shooting-slider json-viewer-slider'}
          isShow={this.showJsonSideslider}
          quickClose={true}
          showMask={this.jsonSliderShowMask}
          zIndex={2700}
          onClosed={() => {
            this.showJsonSideslider = false;
          }}
        >
          {{
            header: () => (
              <div class='json-viewer-slider-header'>
                <span class='title-left'>{this.t('查看完整事件')}</span>
                <span class='divider'>|</span>
                <span class='title-right'> {`${this.t('示例事件')} ${this.currentJsonDataIndex + 1}`}</span>
              </div>
            ),
            default: () => (
              <div class='json-viewer-slider-content'>
                {this.jsonViewerRendered && (
                  <VueJsonPretty
                    collapsedOnClickBrackets={false}
                    data={this.currentJsonData || {}}
                    deep={5}
                    showIcon={true}
                    showKeyValueSpace={true}
                    showLine={false}
                    showLineNumber={true}
                    theme='dark'
                  />
                )}
              </div>
            ),
          }}
        </Sideslider>

        {/* 日志侧滑 */}
        <Sideslider
          width={960}
          extCls={'log-viewer-slider'}
          isShow={this.showLogSideslider}
          quickClose={true}
          zIndex={2700}
          onClosed={() => {
            this.showLogSideslider = false;
          }}
        >
          {{
            header: () => this.t('日志详情'),
            default: () => (
              <div class='log-viewer-slider-content'>
                <LogTableNew
                  key={this.drawerRenderKey}
                  allowedMenuTypes={this.logAllowedMenuTypes}
                  displayFields={this.displayColumnFields}
                  getFieldsData={this.getLogFieldsData}
                  getTableData={this.getLogTableData}
                  headerAffixedTop={{ offsetTop: -60 }}
                  refreshKey={this.logTableRefreshKey}
                  onAddField={this.handleAddField}
                  onClickMenu={this.handleLogClickMenu}
                  onRemoveField={this.handleRemoveField}
                >
                  {{
                    settingBtn: () => (
                      <TableFieldSetting
                        class='table-field-setting'
                        sourceList={this.tableColumnsSetting}
                        targetList={this.displayColumnFields}
                        onConfirm={this.handleDisplayColumnFieldsChange}
                      />
                    ),
                    empty: () => (
                      <Exception type='building'>
                        <span style='margin: 0 24px 16px 24px;font-size: 14px;color: rgb(151, 155, 165);display: inline-block;'>
                          {this.t('暂无关联日志')}
                        </span>
                      </Exception>
                    ),
                  }}
                </LogTableNew>
              </div>
            ),
          }}
        </Sideslider>

        {/* 事件表格侧滑 */}
        <Sideslider
          width={960}
          extCls={'event-table-slider'}
          isShow={this.showEventTableSideslider}
          quickClose={true}
          zIndex={2700}
          onClosed={() => {
            this.showEventTableSideslider = false;
          }}
        >
          {{
            header: () => (
              <div class='event-table-slider-header'>
                <span class='mr-2'>{this.currentDrawerContext?.title || this.t('事件详情')}</span>
              </div>
            ),
            default: () => (
              <div class='event-table-slider-content'>
                {this.drawerErrorMessage ? (
                  <Exception
                    class='exception-wrap-item'
                    description={this.drawerErrorMessage}
                    scene='part'
                    title={this.t('查询异常')}
                    type='500'
                  />
                ) : (
                  <EventTable
                    key={this.drawerRenderKey}
                    getTableData={this.getEventTableData}
                    showHeaderOperate={false}
                  />
                )}
              </div>
            ),
          }}
        </Sideslider>
      </>
    );
  },
});
