import { HomeAssistant, fireEvent, forwardHaptic, navigate, toggleEntity } from "custom-card-helpers";
import { isCarbonNodeType } from "./types";
import type { EntityConfigInternal } from "./types";
import type Chart from "./chart";

interface ToastActionParams {
    action: () => void;
    text: string;
}
interface ShowToastParams {
    message: string;
    action?: ToastActionParams;
    duration?: number;
    dismissable?: boolean;
}
const showToast = (el: HTMLElement, params: ShowToastParams) =>
    fireEvent(el, "hass-notification", params);

export const handleAction = async (
    node: Chart,
    hass: HomeAssistant,
    config: EntityConfigInternal,
    action: string
): Promise<void> => {
    let actionConfig = config.tap_action;

    if (action === "double_tap" && config.double_tap_action) {
        actionConfig = config.double_tap_action;
    } else if (action === "hold" && config.hold_action) {
        actionConfig = config.hold_action;
    }

    if (!actionConfig) {
        actionConfig = {
            action: "more-info",
        };
    }

    if (
        actionConfig.confirmation &&
        (!actionConfig.confirmation.exemptions ||
            !actionConfig.confirmation.exemptions.some((e) => e.user === hass!.user!.id))
    ) {
        forwardHaptic("warning");

        if (
            !confirm(
                actionConfig.confirmation.text ||
                    hass.localize(
                        "ui.panel.lovelace.cards.actions.action_confirmation",
                        "action",
                        hass.localize(
                            "ui.panel.lovelace.editor.action-editor.actions." +
                                actionConfig.action
                        ) ||
                        actionConfig.action
                    )
            )
        ) {
            return;
        }
    }

    switch (actionConfig.action) {
        case "more-info": {
            // @ts-ignore
            const actionEntityId = actionConfig.entity ?? actionConfig.data?.entity_id;
            fireEvent(node, "hass-more-info", {
                entityId:
                    actionEntityId ??
                    (isCarbonNodeType(config.type) ? config.id : config.entity_id || config.id),
            });
            break;
        }
        case "navigate":
            if (actionConfig.navigation_path) {
                navigate(node, actionConfig.navigation_path);
            } else {
                showToast(node, {
                    message: hass.localize("ui.panel.lovelace.cards.actions.no_navigation_path"),
                });
                forwardHaptic("failure");
            }
            break;
        case "url": {
            if (actionConfig.url_path) {
                window.open(actionConfig.url_path);
            } else {
                showToast(node, {
                    message: hass.localize("ui.panel.lovelace.cards.actions.no_url"),
                });
                forwardHaptic("failure");
            }
            break;
        }
        case "toggle": {
            toggleEntity(hass, config.id);
            forwardHaptic("light");
            break;
        }
        // perform-action is what HA's action editor writes; call-service is its old name
        case "perform-action":
        case "call-service": {
            // like HA, accept either key for both names
            const action = ("perform_action" in actionConfig && actionConfig.perform_action) ||
                ("service" in actionConfig && actionConfig.service);
            if (!action) {
                showToast(node, {
                    message:
                        hass.localize("ui.panel.lovelace.cards.actions.no_action") ||
                        hass.localize("ui.panel.lovelace.cards.actions.no_service"),
                });
                forwardHaptic("failure");
                return;
            }
            const [domain, service] = action.split(".", 2);
            hass.callService(
                domain,
                service,
                // @ts-ignore
                actionConfig.data ?? actionConfig.service_data,
                actionConfig.target,
            );
            forwardHaptic("light");
            break;
        }
        case "fire-dom-event": {
            fireEvent(node, "ll-custom", actionConfig);
            break;
        }
        case "zoom": {
            if (node.zoomEntity === config) {
                node.zoomEntity = undefined;
                break;
            }
            node.zoomEntity = config;
            break;
        }
    }
};

declare global {
    interface HASSDomEvents {
        "hass-notification": ShowToastParams;
    }
}