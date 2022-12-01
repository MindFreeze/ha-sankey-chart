/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HomeAssistant } from "custom-card-helpers";
import { Collection } from "home-assistant-js-websocket";
import { addHours, differenceInDays } from 'date-fns';

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
  statistic_id: string;
  start: string;
  end: string;
  last_reset: string | null;
  max: number | null;
  mean: number | null;
  min: number | null;
  sum: number | null;
  state: number | null;
}

export interface EnergySource {
  type: string;
  stat_energy_from?: string;
  stat_energy_to?: string;
  flow_from: {
    stat_energy_from: string;
  }[];
  flow_to: {
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
) =>
  hass.callWS<Statistics>({
    type: "recorder/statistics_during_period",
    start_time: startTime.toISOString(),
    end_time: endTime?.toISOString(),
    statistic_ids,
    period,
    // units,
  });

const calculateStatisticSumGrowth = (
  values: StatisticValue[]
): number | null => {
  if (!values || values.length < 2) {
    return null;
  }
  const endSum = values[values.length - 1].sum;
  if (endSum === null) {
    return null;
  }
  const startSum = values[0].sum;
  if (startSum === null) {
    return endSum;
  }
  return endSum - startSum;
};

export async function getStatistics(hass: HomeAssistant, energyData: EnergyData, devices: string[]): Promise<Record<string, number>> {
  const dayDifference = differenceInDays(
    energyData.end || new Date(),
    energyData.start
  );
  const startMinHour = addHours(energyData.start, -1);
  const period = dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour";



  const data = await fetchStatistics(
    hass,
    startMinHour,
    energyData.end,
    devices,
    period,
    // units
  );
  
  Object.values(data).forEach((stat) => {
    // if the start of the first value is after the requested period, we have the first data point, and should add a zero point
    if (stat.length && new Date(stat[0].start) > startMinHour) {
      stat.unshift({
        ...stat[0],
        start: startMinHour.toISOString(),
        end: startMinHour.toISOString(),
        sum: 0,
        state: 0,
      });
    }
  });

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