import { DEFAULT_ENTITY_CONF, UNIT_PREFIXES } from "./const";
import { Box, Config, Connection, ConnectionState, EntityConfigOrStr, SankeyChartConfig, Section, SectionConfig } from "./types";

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

export function getChildConnections(parent: Box, children: Box[], connections?: ConnectionState[]): Connection[] {
  if (parent.config.type === 'remaining_parent_state') {
    return [];
  }
  return children.map(child => {
    const connection = connections?.find(c => c.child.entity_id === child.entity_id);
    if (!connection) {
      throw new Error(`Missing connection: ${parent.entity_id} - ${child.entity_id}`);
    }
    const {state, prevParentState, prevChildState} = connection;
    if (state <= 0) {
      // only continue if this connection will be rendered
      return {state} as Connection;
    }
    const startY = prevParentState / parent.state * parent.size + parent.top;
    const startSize = Math.max(state / parent.state * parent.size, 0);
    const endY = prevChildState / child.state * child.size + child.top;
    const endSize = Math.max(state / child.state * child.size, 0);

    return {
      startY,
      startSize,
      startColor: parent.color,
      endY,
      endSize,
      endColor: child.color,
      state,
      highlighted: connection.highlighted,
    };
  });
}

export function normalizeConfig(conf: SankeyChartConfig): Config {
  const config = cloneObj(conf);

  const sections: Section[] = config.sections.map((section: SectionConfig) => ({
    ...section,
    entities: section.entities.map(entityConf => (
      typeof entityConf === 'string' 
        ? {...DEFAULT_ENTITY_CONF, children: [], entity_id: entityConf} 
        : {...DEFAULT_ENTITY_CONF, children: [], ...entityConf}
    )),
  }));
  sections.forEach((section: Section, sectionIndex: number) => {
    section.entities.forEach(entityConf => {
      // handle passthrough
      if (entityConf.children && entityConf.children.length) {
        entityConf.children.forEach(child => {
          for (let i = sectionIndex + 1; i < sections.length; i++) {
            const childConf = sections[i].entities.find(
              entity => getEntityId(entity) === child
            );
            if (childConf) {
              if (i > sectionIndex + 1) {
                for (let j = sectionIndex + 1; j < i; j++) {
                  sections[j].entities.push({
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
      // handle legacy remaining
      if (entityConf.remaining) {
        if (sectionIndex === sections.length - 1) {
          console.warn('Can\'t use `remaining` option in the last section');
        } else {
          console.warn('The `remaining` option is deprecated. Use `type: remaining_parent_state` instead.');
          let children = entityConf.children || [];
          let lastChildIndex = 0;
          const nextSectionEntities = sections[sectionIndex + 1].entities;
          while (children.length && lastChildIndex < nextSectionEntities.length) {
            children = children.filter(c => c !== nextSectionEntities[lastChildIndex].entity_id);
            lastChildIndex++;
          }
          const newChildId = 'remaining' + Date.now() + Math.random();
          const remainingConf = typeof entityConf.remaining === 'string'
            ? {name: entityConf.remaining} : entityConf.remaining;
          entityConf.children = [...entityConf.children, newChildId];
          sections[sectionIndex + 1].entities = [
            ...nextSectionEntities.slice(0, lastChildIndex),
            {
              ...entityConf, 
              ...remainingConf, 
              entity_id: newChildId, 
              type: 'remaining_parent_state', 
              remaining: undefined,
              // children: [],
              // accountedState: 0,
              // foundChildren: [],
            },
            ...nextSectionEntities.slice(lastChildIndex),
          ];
        }
      }
    })
  });

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