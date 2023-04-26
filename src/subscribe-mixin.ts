/*
  Copied from https://github.com/home-assistant/frontend/blob/master/src/mixins/subscribe-mixin.ts
*/
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { HomeAssistant } from "custom-card-helpers";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { PropertyValues, ReactiveElement } from "lit";
import { property } from "lit/decorators";

export interface HassSubscribeElement {
  hassSubscribe(): UnsubscribeFunc[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = any> = new (...args: any[]) => T;

export const SubscribeMixin = <T extends Constructor<ReactiveElement>>(
  superClass: T
) => {
  class SubscribeClass extends superClass {
    @property({ attribute: false }) public hass?: HomeAssistant;

    private __unsubs?: Array<UnsubscribeFunc | Promise<UnsubscribeFunc>>;

    public connectedCallback() {
      super.connectedCallback();
      this.__checkSubscribed();
    }

    public disconnectedCallback() {
      super.disconnectedCallback();
      this.hassUnsubscribe();
    }

    protected updated(changedProps: PropertyValues) {
      super.updated(changedProps);
      if (changedProps.has("hass")) {
        this.__checkSubscribed();
      }
    }

    public resetSubscriptions(): void {
      this.hassUnsubscribe();
      this.__checkSubscribed();
    }

    protected hassSubscribe(): Array<
      UnsubscribeFunc | Promise<UnsubscribeFunc>
    > {
      return [];
    }

    protected hassUnsubscribe() {
      if (this.__unsubs) {
        while (this.__unsubs.length) {
          const unsub = this.__unsubs.pop()!;
          if (unsub instanceof Promise) {
            unsub.then((unsubFunc) => unsubFunc());
          } else {
            unsub();
          }
        }
        this.__unsubs = undefined;
      }
    }

    private __checkSubscribed(): void {
      if (
        this.__unsubs !== undefined ||
        !(this as unknown as Element).isConnected ||
        this.hass === undefined
      ) {
        return;
      }
      this.__unsubs = this.hassSubscribe();
    }
  }
  return SubscribeClass;
};