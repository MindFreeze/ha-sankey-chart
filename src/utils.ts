import { DEFAULT_ENTITY_CONF, UNIT_PREFIXES } from "./const";
import { Box, Config, Connection, EntityConfigOrStr, SankeyChartConfig, SectionConfig } from "./types";

export function cloneObj<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function formatState(state: number, round: number): string {
  let rounded: string;
  let decimals = round;
  do {
    // round to first significant digit
    rounded = state.toFixed(decimals++);
  } while (/^[0\.]*$/.test(rounded));

  const formattedState = parseFloat(rounded).toLocaleString();
  return formattedState;
}

export function normalizeStateValue(
  unit_prefix: '' | keyof typeof UNIT_PREFIXES,
  state: number,
  unit_of_measurement?: string,
): { state: number; unit_of_measurement?: string } {
  if (!unit_of_measurement) {
    return { state, unit_of_measurement };
  }
  const prefix = Object.keys(UNIT_PREFIXES).find((p) => unit_of_measurement!.indexOf(p) === 0) || '';
  const currentFactor = UNIT_PREFIXES[prefix] || 1;
  const targetFactor = UNIT_PREFIXES[unit_prefix] || 1;
  if (currentFactor === targetFactor) {
    return { state, unit_of_measurement };
  }
  return {
    state: (state * currentFactor) / targetFactor,
    unit_of_measurement: prefix ? unit_of_measurement.replace(prefix, unit_prefix) : unit_prefix + unit_of_measurement,
  };
}

export function getEntityId(entity: EntityConfigOrStr): string {
  return typeof entity === 'string' ? entity : entity.entity_id;
}

export function getChildConnections(parent: Box, children: Box[]): Connection[] {
  let accountedStartState = 0;
  return children.map(c => {
    const remainingStartState = parent.state - accountedStartState;
    // remaining c.state could be less because of previous connections
    const accountedEndState = c.connections.parents.reduce((sum, c) => sum + c.state, 0);
    const remainingEndState = c.state - accountedEndState;
    const connectionState = Math.min(remainingStartState, remainingEndState);
    if (connectionState <= 0) {
      // only continue if this connection will be rendered
      return {state: connectionState} as Connection;
    }
    const startY = accountedStartState / parent.state * parent.size + parent.top;
    const startSize = Math.max(connectionState / parent.state * parent.size, 0);
    const endY = accountedEndState / c.state * c.size + c.top;
    const endSize = Math.max(connectionState / c.state * c.size, 0);
    accountedStartState += connectionState;

    const connection = {
      startY,
      startSize,
      startColor: parent.color,
      endY,
      endSize,
      endColor: c.color,
      state: connectionState,
    };
    return connection;
  });
}

export function normalizeConfig(conf: SankeyChartConfig): Config {
  const config = cloneObj(conf);

  const sections = config.sections.map((section: SectionConfig, sectionIndex: number) => ({
    entities: section.entities.map(conf => {
      const entityConf = typeof conf === 'string' 
        ? {...DEFAULT_ENTITY_CONF, entity_id: conf} 
        : {...DEFAULT_ENTITY_CONF, ...conf};
      if (entityConf.children) {
        entityConf.children.forEach(child => {
          for (let i = sectionIndex + 1; i < config.sections.length; i++) {
            const childConf = config.sections[i].entities.find(
              entity => getEntityId(entity) === child
            );
            if (childConf) {
              if (i > sectionIndex + 1) {
                for (let j = sectionIndex + 1; j < i; j++) {
                  config.sections[j].entities.push({
                    ...(typeof childConf === 'string' ? {entity_id: childConf} : childConf),
                    type: 'passthrough',
                    children: [child],
                  });
                }
              }
              break;
            }
          }
        });
      }
      return entityConf;
    }),
  }));

  return {
    height: 200,
    unit_prefix: '',
    round: 0,
    min_box_height: 3,
    min_box_distance: 5,
    show_states: true,
    show_units: true,
    ...config,
    sections,
  };
}