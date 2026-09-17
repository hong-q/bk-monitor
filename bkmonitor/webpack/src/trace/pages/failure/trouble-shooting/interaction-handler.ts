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
import type { IInteraction } from '../types';

export interface IOpenDrawerContext {
  detailRef: IInteraction['detail_ref'];
  drawerType: NonNullable<IInteraction['drawer_type']>;
  /** 侧滑标题，仅用于前端展示，不会传给详情接口 */
  title?: string;
}

/**
 * 根据后端返回的交互协议执行页面跳转或打开详情侧滑。
 * URL 与详情查询条件均由后端提供，前端不做拼接或修改。
 * action=error / none 时不执行任何跳转或侧滑。
 */
export function handleInteraction(
  interaction: IInteraction | undefined,
  onOpenDrawer: (context: IOpenDrawerContext) => void
) {
  // none、error 或缺少协议时不跳转、不打开侧滑
  if (!interaction || ['none', 'error'].includes(interaction.action)) {
    return;
  }

  // 外链，以及 trace，都走页面跳转，不进入事件/日志侧滑
  if (interaction.action === 'link' || interaction.drawer_type === 'trace') {
    if (interaction.url) {
      window.open(interaction.url, '_blank');
    }
    return;
  }

  if (interaction.action === 'drawer' && interaction.drawer_type && interaction.detail_ref) {
    onOpenDrawer({
      drawerType: interaction.drawer_type,
      detailRef: interaction.detail_ref,
    });
  }
}
