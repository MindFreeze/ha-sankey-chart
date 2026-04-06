# CLAUDE.md

## Project Overview

**ha-sankey-chart** is a Home Assistant Lovelace custom card that visualizes energy/power/water flows using Sankey diagrams. It shows connections between entities (sources → consumers) in an interactive chart.

## Tech Stack

- **Lit 2.8** - Web component framework
- **TypeScript** - Primary language
- **Rollup** - Module bundler
- **Jest** - Testing framework

## Commands

```bash
npm start      # Dev server with watch (http://127.0.0.1:3000/ha-sankey-chart.js)
npm run build  # Lint + production build
npm run lint   # ESLint check
npm test       # Run Jest tests
```

## Project Structure

```
src/
├── ha-sankey-chart.ts  # Main card entry point
├── chart.ts            # Chart rendering component
├── types.ts            # TypeScript type definitions
├── utils.ts            # Utility functions
├── energy.ts           # Energy dashboard integration
├── migrate.ts          # V3→V4 config migration
├── editor/             # Visual card editor components
└── localize/           # i18n translations
__tests__/              # Jest test files
dist/                   # Build output
```

## Architecture

- **Lit decorators**: `@customElement`, `@property`, `@state`
- **Main components**: `sankey-chart` (card), `sankey-chart-base` (renderer), `sankey-chart-editor`
- **Config format (v4)**: Flat `nodes[]` array + `links[]` connections + `sections[]` settings
- **State management**: `SubscribeMixin` for Home Assistant real-time subscriptions

## Key Patterns

1. **Config normalization**: `normalizeConfig()` auto-migrates v3→v4 format
2. **State values**: `normalizeStateValue()` handles unit prefixes (m, k, M, G, T)
3. **Entity types**: `entity`, `passthrough`, `remaining_parent_state`, `remaining_child_state`
4. **Actions**: tap/hold/double-tap via `handleAction()` from custom-card-helpers

## Testing

Tests in `__tests__/*.test.ts` use mock Home Assistant objects from `__mocks__/hass.mock.ts`. Run `npm test` before committing.

## Git Workflow

- **Main branch**: `master` (stable releases)
- **Current branch**: `v4` (new config format)

## Key Files for Common Tasks

- **Add new config option**: [types.ts](src/types.ts), [ha-sankey-chart.ts](src/ha-sankey-chart.ts)
- **Modify rendering**: [chart.ts](src/chart.ts), [section.ts](src/section.ts)
- **Update editor UI**: [editor/](src/editor/)
- **Change styling**: [styles.ts](src/styles.ts)
- **Fix state calculations**: [utils.ts](src/utils.ts)
