/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HomeAssistant } from "custom-card-helpers";
import { Collection } from "home-assistant-js-websocket";
import { differenceInDays } from 'date-fns';

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
  // HA has not initialized the collection yet and we don't want to interfere with that
  return null;
};


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

export async function getStatistics(hass: HomeAssistant, energyData: EnergyData, devices: string[]): Promise<Record<string, number>> {
  const dayDifference = differenceInDays(
    energyData.end || new Date(),
    energyData.start
  );
  const period = dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour";

  const data = await fetchStatistics(
    hass,
    energyData.start,
    energyData.end,
    devices,
    period,
    // units,
    ["change"]
  );
  
  return devices.reduce((states, id) => ({
    ...states,
    [id]: calculateStatisticSumGrowth(data[id]),
  }), {})
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