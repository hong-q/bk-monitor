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

export interface DragCanvasMoveBaseOptions {
  /** 画布拖拽时留白边距 (默认 30) */
  dragMargin?: number;
  /** 拖拽开始时隐藏子 combo (failure-topo 专用) */
  filterSubCombo?: (graph: any) => void;
  /** 获取 combo 的画布坐标范围 */
  getCanvasByPoint?: (combo: any) => { topLeft: any; bottomRight: any };
  /** 拖拽结束回调 (failure-topo 用于恢复 label 位置) */
  onDragEnd?: () => void;
  /** 拖拽开始回调 */
  onDragStart?: () => void;
}

export interface ScrollCanvasBaseOptions {
  /** 画布滚动时留白边距 (默认 30) */
  dragMargin?: number;
  /** 获取 combo 的画布坐标范围 */
  getCanvasByPoint?: (combo: any) => { topLeft: any; bottomRight: any };
}

/**
 * 创建 getCanvasByPoint 工具函数
 * 用于获取 combo 在画布坐标系中的范围
 */
export function createGetCanvasByPoint(graph: any): (combo: any) => { topLeft: any; bottomRight: any } {
  return (combo: any) => {
    const comboBBox = combo.getBBox();
    return {
      topLeft: graph.getCanvasByPoint(comboBBox.x, comboBBox.y),
      bottomRight: graph.getCanvasByPoint(comboBBox.x + comboBBox.width, comboBBox.y + comboBBox.height),
    };
  };
}

/**
 * 共享的基础版 drag-canvas-move 行为
 * 注: 注册的行为名为 'drag-canvas-move-base'，避免与 failure-topo 的扩展版冲突
 */
export function registerDragCanvasMoveBase(options: DragCanvasMoveBaseOptions = {}): void {
  const { dragMargin = 30, filterSubCombo, onDragStart, onDragEnd, getCanvasByPoint } = options;

  registerBehavior('drag-canvas-move-base', {
    getEvents() {
      return {
        mouseenter: 'onMouseEnter',
        mousedown: 'onMouseDown',
        mousemove: 'onMouseMove',
        mouseup: 'onMouseUp',
        mouseleave: 'onMouseLeave',
      };
    },
    onMouseEnter(e) {
      if (e.item && ['node', 'edge'].includes(e.item.getType())) {
        return;
      }
      const canvas = this.graph.get('canvas');
      const el = canvas.get('el');
      this.comboRect = { el };
      this.comboRect.el.cursor = 'grab';
    },
    onMouseDown(e) {
      if (e.item && ['node', 'edge'].includes(e.item.getType())) {
        return;
      }
      e.item &&
        this.graph.updateItem(e.item, {
          style: { cursor: 'grabbing' },
        });
      this.comboRect.el.style.cursor = 'grabbing';
      this.dragging = true;

      const combos = this.graph.getCombos().filter((combo: any) => !combo.getModel().parentId);
      let xCombo = combos[0];
      let xComboWidth = 0;
      combos.forEach((combo: any) => {
        const { width } = combo.getBBox();
        if (width > xComboWidth) {
          xCombo = combo;
          xComboWidth = width;
        }
      });

      this.comboRect = {
        ...(this.comboRect || {}),
        xCombo,
        topCombo: combos[0],
        bottomCombo: combos[combos.length - 1],
        width: this.graph.getWidth(),
        height: this.graph.getHeight() + 20,
      };

      // 拖拽开始回调
      onDragStart?.();
      // 隐藏子 combo
      filterSubCombo?.(this.graph);
    },
    onMouseMove(e) {
      if (this.dragging) {
        const comboRect = this.comboRect;
        let { movementX, movementY } = e.originalEvent;

        // 边界限制 - 垂直方向
        if (movementY < 0) {
          const { bottomRight } = getCanvasByPoint
            ? getCanvasByPoint(comboRect.bottomCombo)
            : getDefaultCanvasByPoint(this.graph, comboRect.bottomCombo);
          if (bottomRight.y + dragMargin < comboRect.height) {
            movementY = 0;
          }
        } else {
          const { topLeft } = getCanvasByPoint
            ? getCanvasByPoint(comboRect.topCombo)
            : getDefaultCanvasByPoint(this.graph, comboRect.topCombo);
          if (topLeft.y - dragMargin > 0) {
            movementY = 0;
          }
        }

        // 边界限制 - 水平方向
        const { topLeft, bottomRight } = getCanvasByPoint
          ? getCanvasByPoint(comboRect.xCombo)
          : getDefaultCanvasByPoint(this.graph, comboRect.xCombo);
        if (movementX < 0) {
          if (bottomRight.x + dragMargin < comboRect.width) {
            movementX = 0;
          }
        } else {
          if (topLeft.x - dragMargin > 0) {
            movementX = 0;
          }
        }

        this.graph.translate(movementX, movementY);
      }
    },
    onMouseUp(e) {
      this.dragging = false;
      e.item &&
        e.item.getType() === 'combo' &&
        this.graph.updateItem(e.item, {
          style: { cursor: 'grab' },
        });
      this.comboRect.el.style.cursor = 'grab';
      onDragEnd?.();
    },
    onMouseLeave(e) {
      if (this.dragging) {
        e.item &&
          e.item.getType() === 'combo' &&
          this.graph.updateItem(e.item, {
            style: { cursor: 'grab' },
          });
        this.comboRect.el.style.cursor = 'grab';
        this.dragging = false;
        onDragEnd?.();
      }
    },
  });
}

/**
 * 共享的基础版 scroll-canvas 行为
 * 注: 注册的行为名为 'custom-scroll-canvas-base'，避免与 failure-topo 的扩展版冲突
 */
export function registerScrollCanvasBase(options: ScrollCanvasBaseOptions = {}): void {
  const { dragMargin = 30, getCanvasByPoint } = options;

  registerBehavior('custom-scroll-canvas-base', {
    getEvents() {
      return {
        wheel: 'onWheel',
      };
    },
    onWheel: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      const { deltaX, deltaY } = e;
      const sensitivity = 2;
      let dx = -deltaX * sensitivity;
      let dy = -deltaY * sensitivity;

      const combos = e.graph.getCombos().filter((combo: any) => !combo.getModel().parentId);
      const width = e.graph.getWidth();
      const height = e.graph.getHeight() + 20;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // 垂直滚动
        if (deltaY > 0) {
          const bottomCombo = combos[combos.length - 1];
          const { bottomRight } = getCanvasByPoint
            ? getCanvasByPoint(bottomCombo)
            : getDefaultCanvasByPoint(e.graph, bottomCombo);
          if (bottomRight.y + dragMargin < height) {
            dy = 0;
          }
        } else {
          const topCombo = combos[0];
          const { topLeft } = getCanvasByPoint
            ? getCanvasByPoint(topCombo)
            : getDefaultCanvasByPoint(e.graph, topCombo);
          if (topLeft.y - dragMargin > 0) {
            dy = 0;
          }
        }
        dx = 0;
      } else {
        // 水平滚动
        const topCombo = combos[0];
        const coord = getCanvasByPoint ? getCanvasByPoint(topCombo) : getDefaultCanvasByPoint(e.graph, topCombo);
        const { topLeft, bottomRight } = coord;
        if (deltaX > 0) {
          if (bottomRight.x + dragMargin < width) {
            dx = 0;
          }
        } else {
          if (topLeft.x - dragMargin > 0) {
            dx = 0;
          }
        }
        dy = 0;
      }

      e.graph.translate(dx, dy);
    },
  });
}

/** 默认 getCanvasByPoint 实现 (用于 resource-graph) */
function getDefaultCanvasByPoint(graph: any, combo: any) {
  const comboBBox = combo.getBBox();
  return {
    topLeft: graph.getCanvasByPoint(comboBBox.x, comboBBox.y),
    bottomRight: graph.getCanvasByPoint(comboBBox.x + comboBBox.width, comboBBox.y + comboBBox.height),
  };
}
