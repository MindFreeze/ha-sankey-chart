/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HomeAssistant } from "custom-card-helpers";
import { Collection } from "home-assistant-js-websocket";
import { differenceInDays } from 'date-fns';
import { FT3_PER_M3 } from './const';

export const ENERGY_SOURCE_TYPES = ['grid', 'solar', 'battery'];

export interface EnergyData {
  start: Date;
  end?: Date;
  startCompare?: Date;
  endCompare?: Date;
  prefs: EnergyPreferences;
  info: EnergyInfo;
  stats: Statistics;
  // statsMetadata: Record<string, StatisticsMetaData>;
  statsCompare: Statistics;
  // co2SignalConfigEntry?: ConfigEntry;
  co2SignalEntity?: string;
  // fossilEnergyConsumption?: FossilEnergyConsumption;
  // fossilEnergyConsumptionCompare?: FossilEnergyConsumption;
}

export interface Statistics {
  [statisticId: string]: StatisticValue[];
}

export interface StatisticValue {
  start: number;
  end: number;
  change?: number | null;
  last_reset?: number | null;
  max?: number | null;
  mean?: number | null;
  min?: number | null;
  sum?: number | null;
  state?: number | null;
}

export interface Conversions {
  convert_units_to: string;
  co2_intensity_entity: string;
  gas_co2_intensity: number;
  gas_price?: number | null;
  electricity_price?: number | null;
}

const statisticTypes = [
  "change",
  "last_reset",
  "max",
  "mean",
  "min",
  "state",
  "sum",
] as const;
export type StatisticsTypes = (typeof statisticTypes)[number][];

export interface EnergySource {
  type: string;
  stat_energy_from?: string;
  stat_energy_to?: string;
  flow_from?: {
    stat_energy_from: string;
  }[];
  flow_to?: {
    stat_energy_to: string;
  }[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DeviceConsumptionEnergyPreference {
  stat_consumption: string;
  name?: string;
  included_in_stat?: string;
}

export interface EnergyPreferences {
  energy_sources: EnergySource[];
  device_consumption: DeviceConsumptionEnergyPreference[];
}

export interface EnergyInfo {
  cost_sensors: Record<string, string>;
}

export interface EnergyCollection extends Collection<EnergyData> {
  start: Date;
  end?: Date;
  prefs?: EnergyPreferences;
  clearPrefs(): void;
  setPeriod(newStart: Date, newEnd?: Date): void;
  _refreshTimeout?: number;
  _updatePeriodTimeout?: number;
  _active: number;
}

export const getEnergyDataCollection = (
  hass: HomeAssistant,
  key = '_energy'
): EnergyCollection | null => {
  if ((hass.connection as any)[key]) {
    return (hass.connection as any)[key];
  }
  // HA has not initialized the collection yet and we don't want to interfere with that if energy_date_selection is enabled
  return null;
};

export const getEnergyPreferences = (hass: HomeAssistant) =>
  hass.callWS<EnergyPreferences>({
    type: "energy/get_prefs",
  });


const fetchStatistics = (
  hass: HomeAssistant,
  startTime: Date,
  endTime?: Date,
  statistic_ids?: string[],
  period: "5minute" | "hour" | "day" | "week" | "month" = "hour",
  // units?: StatisticsUnitConfiguration
  types?: StatisticsTypes
) =>
  hass.callWS<Statistics>({
    type: "recorder/statistics_during_period",
    start_time: startTime.toISOString(),
    end_time: endTime?.toISOString(),
    statistic_ids,
    period,
    // units,
    types,
  });

export interface FossilEnergyConsumption {
  [date: string]: number;
}

const fetchFossilEnergyConsumption = (
  hass: HomeAssistant,
  startTime: Date,
  energy_statistic_ids: string[],
  co2_statistic_id: string,
  endTime?: Date,
  period: "5minute" | "hour" | "day" | "month" = "hour"
) =>
  hass.callWS<FossilEnergyConsumption>({
    type: "energy/fossil_energy_consumption",
    start_time: startTime.toISOString(),
    end_time: endTime?.toISOString(),
    energy_statistic_ids,
    co2_statistic_id,
    period,
  });

const sumOverTime = (values: FossilEnergyConsumption): number => {
  return Object.values(values).reduce((a, b) => a + b, 0);
};

const calculateStatisticSumGrowth = (
  values: StatisticValue[]
): number | null => {
  let growth: number | null = null;

  if (!values) {
    return null;
  }

  for (const value of values) {
    if (value.change === null || value.change === undefined) {
      continue;
    }
    if (growth === null) {
      growth = value.change;
    } else {
      growth += value.change;
    }
  }

  return growth;
};

export async function getStatistics(hass: HomeAssistant, { start, end }: Pick<EnergyData, 'start' | 'end'>, devices: string[], conversions: Conversions): Promise<Record<string, number>> {
  const dayDifference = differenceInDays(
    end || new Date(),
    start
  );
  const period = dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour";

  let time_invariant_devices: string[] = [];
  const time_variant_data = {};
  if (conversions.convert_units_to == 'gCO2' || conversions.convert_units_to == "gCO2eq") {
    for (const id of devices) {
      if (hass.states[id].attributes.unit_of_measurement == "kWh") {
        // If converting from kWh to CO2, we need to use a different API call to account for time-varying CO2 intensity
        time_variant_data[id] = fetchFossilEnergyConsumption(
          hass,
          start,
          [id],
          conversions.co2_intensity_entity,
          end,
          period
        );
      }
      else {
        // Otherwise, we can get all the data we need from fetchStatistics below
        time_invariant_devices.push(id);
      }
    }
  }
  else {
    time_invariant_devices = devices;
  }

  let time_invariant_data = {};
  if (time_invariant_devices.length > 0) {
    time_invariant_data = await fetchStatistics(
      hass,
      start,
      end,
      time_invariant_devices,
      period,
      // units,
      ["change"]
    );
  }

  const result = {};

  for (const id in time_variant_data) {
    const scale = 100;  // API assumes co2_statistic_id is fossil fuel percentage [0-100], so it divides by 100, which we must undo
    result[id] = sumOverTime(await time_variant_data[id]) * scale;
  }

  for (const id of time_invariant_devices) {
    result[id] = calculateStatisticSumGrowth(time_invariant_data[id])
  
    if (conversions.convert_units_to && result[id]) {
      let scale = 1.0;
      if (conversions.convert_units_to == 'gCO2' || conversions.convert_units_to == "gCO2eq") {
        switch (hass.states[id].attributes.unit_of_measurement) {
          case 'gCO2':
          case 'gCO2eq':
            scale = 1;
            break;
          case "ft³":
          case "ft3":
            scale = conversions.gas_co2_intensity;
            break;
          case "CCF":
          case "ccf":
            scale = conversions.gas_co2_intensity * 100;
            break;
          case "m³":
          case "m3":
            scale = conversions.gas_co2_intensity * FT3_PER_M3;
            break;
          default:
            console.warn("Can't convert from", hass.states[id].attributes.unit_of_measurement, "to", conversions.convert_units_to);
        }
      }
      else if (conversions.convert_units_to == 'MJ') {
        switch (hass.states[id].attributes.unit_of_measurement) {
          case 'MJ':
            scale = 1;
            break;
          case "kWh":
            scale = 3.6;
            break;
          case "Wh":
            scale = 3600;
            break;
          case "ft³":
          case "ft3":
            scale = 1.0551;
            break;
          case "m³":
          case "m3":
              scale = 1.0551 * FT3_PER_M3;
              break;
          default:
            console.warn("Can't convert from", hass.states[id].attributes.unit_of_measurement, "to", conversions.convert_units_to);
        }
      }
      else if (conversions.convert_units_to == 'monetary') {
        switch (hass.states[id].attributes.unit_of_measurement) {
          case "kWh":
            scale = conversions.electricity_price ? conversions.electricity_price : 0;
            break;
          case "Wh":
            scale = conversions.electricity_price ? conversions.electricity_price * 1000 : 0;
            break;
          case "ft³":
          case "ft3":
          case "CCF":
          case "ccf":
          case "m³":
          case "m3":
            scale = conversions.gas_price ? conversions.gas_price : 0;
            break;
          default:
            if (hass.states[id].attributes.device_class == 'monetary')
              scale = 1;
            else
              console.warn("Can't convert from", hass.states[id].attributes.unit_of_measurement, "to", conversions.convert_units_to);
        }
      }
      else {
        console.warn("Can't convert to", conversions.convert_units_to);
      }

      result[id] *= scale;
    }
  }

  return result;
}

export function getEnergySourceColor(type: string) {
  if (type === 'solar') {
    return 'var(--warning-color)';
  }
  if (type === 'battery') {
    return 'var(--success-color)';
  }
  return undefined;
}