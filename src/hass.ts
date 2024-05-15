import { HomeAssistant } from 'custom-card-helpers';

export interface Area {
  area_id: string;
  name: string;
  floor_id?: string | null;
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

export interface DeviceRegistryEntry {
  id: string;
  config_entries: string[];
  connections: Array<[string, string]>;
  identifiers: Array<[string, string]>;
  manufacturer: string | null;
  model: string | null;
  name: string | null;
  sw_version: string | null;
  hw_version: string | null;
  serial_number: string | null;
  via_device_id: string | null;
  area_id: string | null;
  name_by_user: string | null;
  entry_type: 'service' | null;
  disabled_by: 'user' | 'integration' | 'config_entry' | null;
  configuration_url: string | null;
}

export interface ExtEntityRegistryEntry extends EntityRegistryEntry {
  capabilities: Record<string, unknown>;
  original_icon?: string;
  device_class?: string;
  original_device_class?: string;
}

export interface FloorRegistryEntry {
  aliases: string[];
  floor_id: string;
  icon?: string;
  level?: number;
  name: string;
}

export const getExtendedEntityRegistryEntry = (
  hass: HomeAssistant,
  entityId: string,
): Promise<ExtEntityRegistryEntry> =>
  hass.callWS({
    type: 'config/entity_registry/get',
    entity_id: entityId,
  });

let devicesCache: DeviceRegistryEntry[] = [];
export const fetchDeviceRegistry = async (hass: HomeAssistant): Promise<DeviceRegistryEntry[]> => {
  if (devicesCache.length) {
    return Promise.resolve(devicesCache);
  }
  return (devicesCache = await hass.callWS({
    type: 'config/device_registry/list',
  }));
};

export const fetchFloorRegistry = (hass: HomeAssistant): Promise<FloorRegistryEntry[]> =>
  hass.callWS({
    type: 'config/floor_registry/list',
  });

export async function getEntityArea(hass: HomeAssistant, entityId: string) {
  try {
    const extended = await getExtendedEntityRegistryEntry(hass, entityId);
    if (extended.area_id) {
      return extended.area_id;
    }
    const devices = await fetchDeviceRegistry(hass);
    const device = devices.find(d => d.id === extended.device_id);
    if (device && device.area_id) {
      return device.area_id;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export async function getEntitiesByArea(hass: HomeAssistantReal, entityIds: string[]) {
  const result: Record<string, { area: Area; entities: string[] }> = {};
  for (const entityId of entityIds) {
    const areaId = await getEntityArea(hass, entityId);
    const area = areaId ? hass.areas[areaId] : { area_id: 'no_area', name: 'No area' };
    if (!result[area.area_id]) {
      result[area.area_id] = { area, entities: [] };
    }
    result[area.area_id].entities.push(entityId);
  }
  return result;
}
