import { svg, SVGTemplateResult } from "lit";
import { UNIT_PREFIXES } from "./const";
import { Box, Connection, EntityConfigOrStr } from "./types";

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