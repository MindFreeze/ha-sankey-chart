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
        position: relative;
        min-height: 1px;
        /* margin: 5px 0; */
        /* background-color: var(--accent-color); */
    }
    .box::before {
        content: "";
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        background-color: var(--accent-color);
        opacity: 0.5;
    }
    .connectors {
        flex: 0.25;
        flex-direction: column;
        position: relative;
    }
    .connectors path {
        fill: var(--accent-color);
        opacity: 0.5;
    }
`;