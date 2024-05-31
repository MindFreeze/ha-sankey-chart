import { css, unsafeCSS } from 'lit';
import { MIN_VERTICAL_SECTION_H } from './const';

// https://lit.dev/docs/components/styles/
export default css`
    ha-card {
        overflow-x: auto;
    }
    .container {
        display: flex;
        position: relative;
        /* height: 210px; */
        padding: 16px;
        overflow: hidden;
    }
    .container.with-header {
        margin-top: -16px;
    }
    .container.vertical {
        flex-direction: column;
    }
    .section {
        flex: 1;
        flex-direction: column;
        position: relative;
        min-width: 0;
        max-width: 50%;
    }
    .vertical .section {
        display: flex;
        flex: initial;
        flex-direction: row-reverse;
        align-items: flex-start;
        max-width: 100%;
        width: 100%;
        height: ${unsafeCSS(MIN_VERTICAL_SECTION_H + 'px')};
    }
    .wide .section:last-child {
        flex: initial;
    }
    .spacerv {
        transition: height 0.25s;
    }
    .vertical .spacerv {
        transition: width 0.25s;
    }
    .box {
        display: flex;
        align-items: center;
        /* position: relative; */
        /* min-height: 1px; */
        transition: height 0.25s;
    }
    .vertical .box {
        flex-direction: column;
        transition: width 0.25s;
    }
    /* .box::before {
        content: "";
        position: absolute;
        top: -2px;
        bottom: -2px;
        left: -2px;
        right: -2px;
        background-color: var(--primary-color);
        opacity: 0.5;
        border-radius: 3px;
    } */
    .box div:first-child {
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        background-color: var(--primary-color);
        width: 15px;
        height: 100%;
        cursor: pointer;
    }
    .vertical .box div:first-child {
        width: 100%;
        height: 15px;
    }
    .box.type-passthrough div:first-child {
        opacity: 0.4;
    }
    .box.type-passthrough div.hl:first-child {
        opacity: 0.85;
    }
    .box .label {
        flex: 1;
        display: flex;
        align-items: center;
        padding: 0 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .vertical .box .label {
        padding: 5px 0 0;
        flex-direction: column;
        white-space: normal;
        /* word-break: break-all; */
        text-align: center;
    }
    .box .label .name {
        font-style: italic;
        font-size: inherit;
    }
    .connectors {
        position: absolute;
        top: 0;
        left: 15px;
        right: 0;
        height: 100%;
        overflow: hidden;
    }
    .vertical .connectors {
        top: 15px;
        left: 0;
        bottom: 0;
        height: auto;
    }
    .connectors svg {
        position: absolute;
        left: -1px;
        width: 101%;
        height: 100%;
    }
    .vertical .connectors svg {
        top: -1px;
        left: 0;
        width: 100%;
        height: 101%;
    }
`;