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
    }
    .box {
        display: flex;
        align-items: center;
        position: relative;
        min-height: 1px;
        background-color: var(--primary-color);
        color: var(--primary-text-color);
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
    .connectors {
        flex: 0.25;
        flex-direction: column;
        position: relative;
    }
    .connectors path {
        fill: var(--primary-color);
        /* opacity: 0.75; */
    }
`;