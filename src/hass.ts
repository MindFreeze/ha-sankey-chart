import { HomeAssistant } from 'custom-card-helpers';

export interface Area {
  area_id: string;
  name: string;
}

export interface HomeAssistantReal extends HomeAssistant {
  areas: Record<string, Area>;
}

export interface EntityRegistryEntry {
  id: string;
  entity_id: string;
  name: string | null;
  icon: string | null;
  platform: string;
  config_entry_id: string | null;
  device_id: string | null;
  area_id: string | null;
  disabled_by: 'user' | 'device' | 'integration' | 'config_entry' | null;
  hidden_by: Exclude<EntityRegistryEntry['disabled_by'], 'config_entry'>;
  entity_category: 'config' | 'diagnostic' | null;
  has_entity_name: boolean;
  original_name?: string;
  unique_id: string;
  translation_key?: string;
}

export interface ExtEntityRegistryEntry extends EntityRegistryEntry {
  capabilities: Record<string, unknown>;
  original_icon?: string;
  device_class?: string;
  original_device_class?: string;
}

export const getExtendedEntityRegistryEntry = (
  hass: HomeAssistant,
  entityId: string,
): Promise<ExtEntityRegistryEntry> =>
  hass.callWS({
    type: 'config/entity_registry/get',
    entity_id: entityId,
  });

export async function getEntityArea(hass: HomeAssistant, entityId: string) {
  const extended = await getExtendedEntityRegistryEntry(hass, entityId);
  return extended.area_id;
}

export async function getEntitiesByArea(hass: HomeAssistantReal, entityIds: string[]) {
  const result: Record<string, { area: Area; entities: string[] }> = {};
  for (const entityId of entityIds) {
    const areaId = await getEntityArea(hass, entityId);
    const area = areaId ? hass.areas[areaId] : {area_id: 'no_area', name: 'No area'};
    if (!result[area.area_id]) {
      result[area.area_id] = { area, entities: [] };
    }
    result[area.area_id].entities.push(entityId);
  }
  return result;
}
