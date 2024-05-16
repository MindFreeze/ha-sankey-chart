import { ConnectionState, EntityConfigInternal } from './types';

export function reconcileEntity(
  entityConf: EntityConfigInternal,
  direction: 'parents' | 'children',
  connections: ConnectionState[],
  getState: (entityConf: EntityConfigInternal) => { state: number; last_updated: string },
) {
  const reconcileConf = direction === 'parents' ? entityConf.parents_sum! : entityConf.children_sum!;
  const reconciliations = new Map<EntityConfigInternal, number>();
  const { state, last_updated } = getState(entityConf);
  const relatedConfigs: EntityConfigInternal[] = [];
  const connectionSide = direction === 'children' ? 'child' : 'parent';
  const sum =
    connections.reduce((sum, c) => {
      relatedConfigs.push(c[connectionSide]);
      return sum + getState(c[connectionSide]).state;
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
        const entityLastUpdated = new Date(last_updated).getTime();
        const relationIsFresher = relatedConfigs.some(relatedConf => {
          const relatedLastUpdated = new Date(getState(relatedConf).last_updated).getTime();
          return relatedLastUpdated > entityLastUpdated;
        });
        if (relationIsFresher) {
          reconciled = sum;
        }
        break;
    }
    reconciliations.set(entityConf, reconciled);
    relatedConfigs.forEach(relatedConf => {
      // don't compute a scaling factor in advance, because it increases floating point error
      reconciliations.set(relatedConf, (getState(relatedConf).state / sum) * reconciled);
    });
  }
  return reconciliations;
}
