import { css } from 'lit-element';

// https://lit.dev/docs/components/styles/
export default css`
    ha-card {
        padding: 5px 0;
        background-color: var(--primary-background-color);
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
    }
    .section:last-child {
        flex: initial;
    }
    .box {
        display: flex;
        align-items: center;
        /* position: relative; */
        /* min-height: 1px; */
        color: var(--primary-text-color);
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
        background-color: var(--primary-color);
        width: 15px;
        height: 100%;
    }
    .box span {
        margin: 0 10px;
        white-space: nowrap;
    }
    .box span span {
        font-style: italic;
        margin: 0;
    }
    .connectors {
        position: absolute;
        top: 0;
        left: 15px;
        width: 100%;
        height: 100%;
    }
    .connectors path {
        /* fill: var(--primary-color); */
        opacity: 0.4;
    }
`;