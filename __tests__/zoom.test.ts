import type { Config } from '../src/types';
import { filterConfigByZoomEntity } from '../src/zoom';

const config = {
  type: '',
  layout: 'auto' as const,
  unit_prefix: '',
  round: 0,
  height: 200,
  min_box_size: 3,
  min_box_distance: 5,
  min_state: 0,
  nodes: [],
  links: [],
  sections: [
    {
      entities: [
        {
          id: 'ent1',
          type: 'entity' as const,
          children: ['ent2', 'ent3'],
        },
      ],
    },
    {
      entities: [
        {
          id: 'ent2',
          type: 'entity' as const,
          children: ['ent4'],
        },
        {
          id: 'ent3',
          type: 'entity' as const,
          children: ['ent5'],
        },
      ],
    },
    {
      entities: [
        {
          id: 'ent4',
          type: 'entity' as const,
          children: [],
        },
        {
          id: 'ent5',
          type: 'entity' as const,
          children: [],
        },
      ],
    },
  ],
} as Config;

describe('zoom action', () => {
  it('filters a config based on zoom entity', async () => {
    const filtered = filterConfigByZoomEntity(config, config.sections[1].entities[0]);
    expect(filtered.sections).toEqual([
      {
        entities: [
          {
            id: 'ent2',
            type: 'entity',
            children: ['ent4'],
          },
        ],
      },
      {
        entities: [
          {
            id: 'ent4',
            type: 'entity',
            children: [],
          },
        ],
      },
    ]);
  });
  it('returns the same config when there is no zoom entity', async () => {
    expect(filterConfigByZoomEntity(config, undefined)).toEqual(config);
  });
});
