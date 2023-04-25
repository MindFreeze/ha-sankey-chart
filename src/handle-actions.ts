import { HomeAssistant, fireEvent, forwardHaptic, navigate, toggleEntity } from "custom-card-helpers";
import { ActionConfigExtended } from "./types";

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
    node: HTMLElement,
    hass: HomeAssistant,
    config: {
        entity_id: string;
        hold_action?: ActionConfigExtended;
        tap_action?: ActionConfigExtended;
        double_tap_action?: ActionConfigExtended;
    },
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
            fireEvent(node, "hass-more-info", {
                // @ts-ignore
                entityId: actionConfig.entity ?? actionConfig.data?.entity_id ?? config.entity_id,
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
            toggleEntity(hass, config.entity_id);
            forwardHaptic("light");
            break;
        }
        case "call-service": {
            if (!actionConfig.service) {
                showToast(node, {
                    message: hass.localize("ui.panel.lovelace.cards.actions.no_service"),
                });
                forwardHaptic("failure");
                return;
            }
            const [domain, service] = actionConfig.service.split(".", 2);
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
        }
    }
};

declare global {
    interface HASSDomEvents {
        "hass-notification": ShowToastParams;
    }
}