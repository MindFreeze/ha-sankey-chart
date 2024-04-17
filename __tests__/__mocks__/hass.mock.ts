import { HassEntity } from "home-assistant-js-websocket";

export default (states: Record<string, Partial<HassEntity>> = {}) => ({
    // `mock: true` is there so Object.keys(hass.states) is not 0
    states: new Proxy({mock: true, ...states}, {
        get: function(target, entityId, receiver) {
            if (Reflect.has(target, entityId)) {
                return Reflect.get(target, entityId, receiver);
            } else if (typeof entityId === 'string' && /[a-z]+\..+/.test(entityId)) {
                return {
                    entity_id: entityId,
                    // deterministaically generate a number in the range 0-10000 based on the entity id
                    state: String(entityId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000),
                    attributes: {
                        unit_of_measurement: 'W',
                    },
                };
            }
            return undefined;
        },
    })
});