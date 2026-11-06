import { css } from 'lit';

export const editorStyles = css`
  :host {
    display: block;
  }
  .view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .header .title {
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
  }
  .title,
  .primary,
  .secondary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .secondary {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 16px;
  }
  .error-text {
    color: var(--error-color);
  }
  ha-icon-button {
    --mdc-icon-button-size: 40px;
    --ha-icon-button-size: 40px;
    color: var(--secondary-text-color);
    flex: none;
  }
  ha-icon-button ha-icon {
    display: flex;
  }
  .flip-rtl:dir(rtl) {
    transform: scaleX(-1);
  }
  .note {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 14px;
    line-height: 20px;
  }
  .block {
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--card-background-color);
    overflow: hidden;
  }
  .block-header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    padding-block: 4px;
    padding-inline: 16px 4px;
  }
  .block-header .title {
    font-size: 16px;
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding-block: 4px;
    padding-inline: 12px 4px;
    border-top: 1px solid var(--divider-color);
    cursor: pointer;
  }
  .row:hover {
    background: var(--secondary-background-color);
  }
  .swatch {
    flex: none;
    width: 4px;
    align-self: stretch;
    margin-block: 4px;
    border-radius: 2px;
  }
  .node-icon {
    flex: none;
    color: var(--state-icon-color, var(--secondary-text-color));
    --mdc-icon-size: 24px;
  }
  .node-icon.missing {
    color: var(--error-color);
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  button.info {
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  button.info:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  button.info > span {
    display: block;
  }
  .badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--secondary-text-color);
    font-size: 12px;
    --mdc-icon-size: 16px;
  }
  .handle {
    flex: none;
    display: flex;
    cursor: grab;
    color: var(--secondary-text-color);
    --mdc-icon-size: 20px;
  }
  .empty {
    padding-block: 8px;
    padding-inline: 16px;
    border-top: 1px solid var(--divider-color);
    color: var(--secondary-text-color);
    font-size: 14px;
  }
  .block-footer {
    display: block;
    padding: 8px 12px 12px;
  }
  .block-body {
    padding: 0 12px 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    min-height: 32px;
    padding-block: 4px;
    padding-inline: 8px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 16px;
    background: none;
    color: var(--primary-text-color);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .chip:hover,
  .chip:focus-visible {
    background: var(--secondary-background-color);
  }
  .chip .swatch {
    width: 12px;
    height: 12px;
    margin: 0;
    border-radius: 50%;
    align-self: center;
  }
  .chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a {
    color: var(--primary-color);
  }
`;
