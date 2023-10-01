import type { Config } from '../src/types';
import { filterConfigByZoomEntity } from '../src/zoom';

const config = {
  type: '',
  sections: [
    {
      entities: [
        {
          entity_id: 'ent1',
          children: ['ent2', 'ent3'],
        },
      ],
    },
    {
      entities: [
        {
          entity_id: 'ent2',
          children: ['ent4'],
        },
        {
          entity_id: 'ent3',
          children: ['ent5'],
        },
      ],
    },
    {
      entities: [
        {
          entity_id: 'ent4',
          children: [],
        },
        {
          entity_id: 'ent5',
          children: [],
        },
      ],
    },
  ],
} as Config;

describe('zoom action', () => {
  it('filters a config based on zoom entity', async () => {
    expect(filterConfigByZoomEntity(config, config.sections[1].entities[0])).toEqual({
      type: '',
      sections: [
        {
          entities: [
            {
              entity_id: 'ent2',
              children: ['ent4'],
            },
          ],
        },
        {
          entities: [
            {
              entity_id: 'ent4',
              children: [],
            },
          ],
        },
      ],
    });
  });
  it('returns the same config when there is no zoom entity', async () => {
    expect(filterConfigByZoomEntity(config, undefined)).toEqual(config);
  });
});
