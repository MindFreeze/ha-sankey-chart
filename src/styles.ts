import { css } from 'lit-element';

// https://lit.dev/docs/components/styles/
export default css`
    ha-card {
        padding: 12px;
    }
    .container {
        display: flex;
        position: relative;
        width: 100%;
        /* height: 210px; */
    }
    .section {
        flex: 1;
        flex-direction: column;
        position: relative;
        min-width: 0;
        max-width: 50%;
    }
    .wide .section:last-child {
        flex: initial;
    }
    .spacerv {
        transition: height 0.2s;
    }
    .box {
        display: flex;
        align-items: center;
        /* position: relative; */
        /* min-height: 1px; */
        transition: height 0.25s;
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
    .box .label {
        flex: 1;
        display: flex;
        align-items: center;
        padding: 0 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .box .label span {
        font-style: italic;
    }
    .connectors {
        position: absolute;
        top: 0;
        left: 14px;
        right: -1px;
        height: 100%;
    }
    .connectors svg {
        width: 100%;
        height: 100%;
    }
    .connectors path {
        /* fill: var(--primary-color); */
        opacity: 0.4;
    }
`;