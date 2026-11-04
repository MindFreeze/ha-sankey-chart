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
`;
