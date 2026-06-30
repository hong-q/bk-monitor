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
import { registerBehavior } from '@antv/g6';

/** 增加画布离画布上下左右的留白区域 */
const GRAPH_DRAG_MARGIN = 100;

/**
 * 注册自定义滚动行为 - failure-topo 版本
 * 使用 GRAPH_DRAG_MARGIN = 100
 * @param getCanvasByPoint - 获取 combo 画布坐标的函数
 */
export function registerScrollCanvas(getCanvasByPoint: (combo: any) => { bottomRight: any; topLeft: any }): void {
  registerBehavior('custom-scroll-canvas', {
    getEvents() {
      return {
        wheel: 'onWheel',
      };
    },
    onWheel: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      const { deltaX, deltaY } = e;
      // 设置滚动灵敏度
      const sensitivity = 2;
      let dx = -deltaX * sensitivity;
      let dy = -deltaY * sensitivity;

      // 获取所有combos的布局信息
      const combos = e.graph.getCombos().filter((combo: any) => !combo.getModel().parentId);
      const width = e.graph.getWidth();
      const height = e.graph.getHeight() + 20;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // vertical scroll
        if (deltaY > 0) {
          const bottomCombo = combos[combos.length - 1];
          const { bottomRight } = getCanvasByPoint(bottomCombo);
          if (bottomRight.y + GRAPH_DRAG_MARGIN < height) {
            dy = 0;
          }
        } else {
          const topCombo = combos[0];
          const { topLeft } = getCanvasByPoint(topCombo);
          if (topLeft.y - GRAPH_DRAG_MARGIN > 0) {
            dy = 0;
          }
        }
        dx = 0;
      } else {
        const topCombo = combos[0];
        const { topLeft, bottomRight } = getCanvasByPoint(topCombo);
        /** 大于0判断右侧 否则判断左侧 */
        if (deltaX > 0) {
          if (bottomRight.x + GRAPH_DRAG_MARGIN < width) {
            dx = 0;
          }
        } else {
          if (topLeft.x - GRAPH_DRAG_MARGIN > 0) {
            dx = 0;
          }
        }
        dy = 0;
      }
      e.graph.translate(dx, dy);
    },
  });
}
