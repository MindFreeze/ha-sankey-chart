import { css } from 'lit';

// https://lit.dev/docs/components/styles/
export default css`
    ha-card {
        overflow-x: auto;
    }
    .container {
        position: relative;
        padding: 16px;
        overflow: hidden;
    }
    .container.with-header {
        margin-top: -16px;
    }
    .chart {
        display: block;
        max-width: 100%;
        overflow: visible;
    }
    .box {
        cursor: pointer;
    }
    .box .color-bar {
        transition: x 0.25s, y 0.25s, width 0.25s, height 0.25s;
    }
    .box.type-passthrough .color-bar {
        fill-opacity: 0.4;
    }
    .box.type-passthrough.hl .color-bar {
        fill-opacity: 0.85;
    }
    foreignObject {
        overflow: visible;
        pointer-events: none;
    }
    .icon-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    .label-wrap {
        display: flex;
        align-items: center;
        width: 100%;
        height: 100%;
    }
    .vertical .label-wrap {
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
    }
    .box .label {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 0 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        box-sizing: border-box;
        pointer-events: auto;
    }
    .vertical .box .label {
        padding: 5px 0 0;
        flex-direction: column;
        white-space: normal;
        text-align: center;
        max-width: none;
        overflow: visible;
        pointer-events: none;
    }
    .vertical .box .label > * {
        pointer-events: auto;
    }
    .box .label .name {
        font-style: italic;
        font-size: inherit;
    }
    .box .label .name a {
        position: sticky;
        z-index: 100;
        color: var(--primary-text-color);
        pointer-events: auto;
    }

    /* Preview editing */
    .editing .chart {
        height: auto;
        outline: none;
        user-select: none;
        -webkit-user-select: none;
    }
    .editing.focus-ring .chart:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: 4px;
        border-radius: 4px;
    }
    .editing .box {
        cursor: grab;
        touch-action: none;
    }
    .editing .box.type-passthrough {
        cursor: default;
    }
    .editing .box .label {
        pointer-events: auto;
    }
    .editing .box.ghost .color-bar {
        fill-opacity: 0.2;
        stroke-width: 1.5;
        stroke-dasharray: 3 2;
    }
    .editing .box.ghost .label-wrap {
        opacity: 0.6;
    }
    .editing .box.missing .color-bar {
        stroke: var(--error-color, #db4437);
    }
    .editing .box.missing .label-wrap {
        color: var(--error-color, #db4437);
    }
    .editing .box.dragging {
        opacity: 0.3;
    }
    .editing .box.link-dim {
        opacity: 0.35;
    }
    .editing .box.link-candidate .color-bar {
        stroke: var(--primary-color);
        stroke-width: 2;
        stroke-dasharray: 3 2;
    }
    .editing .box.link-hover .color-bar {
        stroke: var(--primary-color);
        stroke-width: 3;
        stroke-dasharray: none;
    }
    .selection-ring {
        fill: none;
        stroke: var(--primary-color);
        stroke-width: 2;
        pointer-events: none;
    }
    .link-handle {
        cursor: crosshair;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        touch-action: none;
    }
    .box:hover .link-handle,
    .box.selected .link-handle {
        opacity: 1;
        pointer-events: auto;
    }
    .link-handle .hit {
        fill: transparent;
    }
    .link-handle .hit.coarse {
        display: none;
    }
    @media (pointer: coarse) {
        .link-handle .hit.coarse {
            display: inline;
        }
    }
    .link-handle .dot {
        fill: var(--card-background-color, #fff);
        stroke: var(--primary-color);
        stroke-width: 2;
    }
    .link-handle:hover .dot {
        fill: var(--primary-color);
    }
    .editing .connectors path.link {
        cursor: pointer;
    }
    .editing .connectors path.link:hover {
        fill-opacity: 0.7;
    }
    .ghost-link:hover .line {
        stroke: var(--primary-color);
        opacity: 1;
    }
    .editing .connectors path.link.selected {
        fill-opacity: 0.85;
        stroke: var(--primary-color);
        stroke-width: 1.5;
    }
    .ghost-link .line {
        fill: none;
        stroke: var(--secondary-text-color);
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
        opacity: 0.7;
        pointer-events: none;
    }
    .ghost-link .hit {
        fill: none;
        stroke: transparent;
        stroke-width: 10;
        cursor: pointer;
    }
    .ghost-link.selected .line {
        stroke: var(--primary-color);
        stroke-width: 2.5;
        opacity: 1;
    }
    .drop-column {
        fill: var(--primary-color);
        fill-opacity: 0.06;
        pointer-events: none;
    }
    .empty-section {
        fill: none;
        stroke: var(--divider-color, rgba(127, 127, 127, 0.4));
        stroke-width: 1.5;
        stroke-dasharray: 5 4;
    }
    .empty-section.drop-target {
        fill: var(--primary-color);
        fill-opacity: 0.08;
        stroke: var(--primary-color);
    }
    .empty-section-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        height: 100%;
        padding: 4px;
        box-sizing: border-box;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.2;
        text-align: center;
        overflow: hidden;
    }
    .vertical .empty-section-content {
        flex-direction: row;
    }
    .empty-section-content .add-node {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex: none;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
        color: var(--primary-text-color);
        cursor: pointer;
        pointer-events: auto;
        --mdc-icon-size: 18px;
    }
    .empty-section-content .add-node:hover,
    .empty-section-content .add-node:focus-visible {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        outline: none;
    }
    .drop-marker {
        stroke: var(--primary-color);
        stroke-width: 3;
        stroke-linecap: round;
        pointer-events: none;
    }
    .new-section-marker {
        pointer-events: none;
    }
    .new-section-marker line {
        stroke: var(--primary-color);
        stroke-width: 2;
        stroke-dasharray: 6 4;
    }
    .new-section-marker circle {
        fill: var(--primary-color);
    }
    .new-section-marker path {
        stroke: var(--text-primary-color, #fff);
        stroke-width: 2;
        stroke-linecap: round;
    }
    .drag-preview {
        pointer-events: none;
        opacity: 0.85;
    }
    .drag-preview text,
    .add-node-hint text {
        fill: var(--primary-text-color);
        font-size: 12px;
        paint-order: stroke;
        stroke: var(--card-background-color, #fff);
        stroke-width: 3px;
    }
    .link-preview {
        pointer-events: none;
    }
    .link-preview path {
        fill: none;
        stroke: var(--primary-color);
        stroke-width: 2;
        stroke-dasharray: 5 4;
    }
    .link-preview.snapped path {
        stroke-dasharray: none;
    }
    .link-preview circle {
        fill: var(--primary-color);
    }
    .add-node-hint {
        pointer-events: none;
    }
`;
