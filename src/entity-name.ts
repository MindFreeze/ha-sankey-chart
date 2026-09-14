import { HomeAssistant } from 'custom-card-helpers';
import { HassEntity } from 'home-assistant-js-websocket';
import { EntityName } from './types';

function atLeastVersion(hass: HomeAssistant | undefined, major: number, minor: number): boolean {
  const [haMajor, haMinor] = (hass?.config?.version ?? '').split('.', 2);
  return Number(haMajor) > major || (Number(haMajor) === major && Number(haMinor) >= minor);
}

// hass.formatEntityName only accepts a card's `name` option (a user string, a
// structured name, or undefined) from HA 2026.4. Earlier versions expose the
// same helper with an incompatible signature, so feature detection is not
// enough - the version has to be checked.
function supportsEntityNames(hass: HomeAssistant | undefined): boolean {
  return atLeastVersion(hass, 2026, 4);
}

/**
 * The `entity_name` selector, which lets users compose a name out of registry
 * parts in the visual editor, was added in HA 2025.11.
 */
export function supportsEntityNameSelector(hass: HomeAssistant | undefined): boolean {
  return atLeastVersion(hass, 2025, 11);
}

// formatEntityName resolves against the entity/device/area/floor registries, and
// HA swaps the real formatter in asynchronously once translations load. Neither
// shows up as an entity state change, so without this a rename (or that swap)
// leaves rendered labels stale until some unrelated state change forces a render.
const NAME_SOURCES = ['formatEntityName', 'entities', 'devices', 'areas', 'floors'] as const;

export function entityNamesChanged(
  oldHass: HomeAssistant | undefined,
  newHass: HomeAssistant | undefined,
): boolean {
  if (!oldHass || !newHass) {
    return false;
  }
  const before = oldHass as unknown as Record<string, unknown>;
  const after = newHass as unknown as Record<string, unknown>;
  return NAME_SOURCES.some(key => before[key] !== after[key]);
}

type HassWithEntityNames = HomeAssistant & {
  formatEntityName: (stateObj: HassEntity, name: EntityName | undefined) => string;
};

/**
 * Resolves a `name` option against the entity's registry context (entity,
 * device, area, floor). Falls back to the friendly name on Home Assistant
 * versions that cannot resolve a structured name.
 */
export function computeEntityName(
  hass: HomeAssistant | undefined,
  stateObj: HassEntity | undefined,
  name: EntityName | undefined,
): string {
  const configuredName = typeof name === 'string' ? name : '';

  if (!stateObj || !hass) {
    return configuredName;
  }
  if (supportsEntityNames(hass)) {
    return hass ? (hass as HassWithEntityNames).formatEntityName(stateObj, name) : configuredName;
  }
  return configuredName || stateObj.attributes.friendly_name || '';
}
