import { ConnectionState, EntityConfigInternal } from './types';

export function reconcileEntity(
  entityConf: EntityConfigInternal,
  direction: 'parents' | 'children',
  connections: ConnectionState[],
  getState: (entityConf: EntityConfigInternal) => number,
) {
  const reconcileConf = direction === 'parents' ? entityConf.parents_sum! : entityConf.children_sum!;
  const reconciliations = new Map<EntityConfigInternal, number>();
  const state = getState(entityConf);
  const relatedConfigs: EntityConfigInternal[] = [];
  const connectionSide = direction === 'children' ? 'child' : 'parent';
  const sum =
    connections.reduce((sum, c) => {
      relatedConfigs.push(c[connectionSide]);
      return sum + getState(c[connectionSide]);
    }, 0) ?? 0;
  const { should_be } = reconcileConf;
  if (
    (should_be === 'equal' && sum !== state) ||
    (should_be === 'equal_or_more' && sum < state) ||
    (should_be === 'equal_or_less' && sum > state)
  ) {
    // reconcile
    const { reconcile_to } = reconcileConf;
    let reconciled = state;
    switch (reconcile_to) {
      case 'min':
        reconciled = Math.min(sum, state);
        break;
      case 'max':
        reconciled = Math.max(sum, state);
        break;
      case 'mean':
        reconciled = (sum + state) / 2;
        break;
      case 'latest':
        // @TODO
        break;
    }
    reconciliations.set(entityConf, reconciled);
    relatedConfigs.forEach(relatedConf => {
      // don't compute a scaling factor in advance, because it increases floating point error
      reconciliations.set(relatedConf, getState(relatedConf) / sum * reconciled);
    });
  }
  return reconciliations;
}
