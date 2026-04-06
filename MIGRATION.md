# Migration Guide: v3 to v4 Config Format

> **Note:** If you use the visual card editor, your config will be automatically converted to v4 format when you save. This guide is for users who edit their configuration in YAML mode only.

This guide explains how to manually convert your existing v3 configuration to the new v4 format.

## Overview of Changes

The v4 format separates the config into three distinct parts:

| v3 Format | v4 Format |
|-----------|-----------|
| `sections[].entities[]` | `nodes[]` - flat list of all entities |
| `entity.children[]` | `links[]` - connections between nodes |
| `entity_id` | `id` |
| `connection_entity_id` | `value` (in links) |
| `color_on_state`, `color_limit`, `color_above`, `color_below` | `color` object with ranges |

## Step-by-Step Migration

### Step 1: Extract nodes from sections

In v3, entities were nested inside sections. In v4, all nodes are in a flat `nodes[]` array with a `section` index.

**v3:**
```yaml
sections:
  - entities:
      - entity_id: sensor.power
        name: Total Power
      - entity_id: sensor.solar
  - entities:
      - entity_id: sensor.device1
      - entity_id: sensor.device2
```

**v4:**
```yaml
nodes:
  - id: sensor.power        # entity_id -> id
    section: 0              # first section = index 0
    name: Total Power
  - id: sensor.solar
    section: 0
  - id: sensor.device1
    section: 1              # second section = index 1
  - id: sensor.device2
    section: 1
```

### Step 2: Convert children to links

In v3, parent-child relationships were defined via `children[]` on each entity. In v4, these become entries in the `links[]` array.

**v3:**
```yaml
sections:
  - entities:
      - entity_id: sensor.power
        children:
          - sensor.device1
          - sensor.device2
  - entities:
      - sensor.device1
      - sensor.device2
```

**v4:**
```yaml
nodes:
  - id: sensor.power
    section: 0
  - id: sensor.device1
    section: 1
  - id: sensor.device2
    section: 1
links:
  - source: sensor.power
    target: sensor.device1
  - source: sensor.power
    target: sensor.device2
```

### Step 3: Convert connection entities

If you used `connection_entity_id` to specify how much flows between nodes, use the `value` property in links.

**v3:**
```yaml
- entity_id: sensor.floor1
  children:
    - entity_id: sensor.washer
      connection_entity_id: sensor.washer_energy
```

**v4:**
```yaml
links:
  - source: sensor.floor1
    target: sensor.washer
    value: sensor.washer_energy
```

### Step 4: Convert color ranges (optional)

If you used `color_on_state` with `color_limit`, `color_above`, and `color_below`, convert to the new color object format.

**v3:**
```yaml
- entity_id: sensor.temperature
  color_on_state: true
  color_limit: 25
  color_above: red
  color_below: green
```

**v4:**
```yaml
- id: sensor.temperature
  color:
    red:
      from: 25    # red when >= 25
    green:
      to: 25      # green when < 25
```

The new format is more flexible and supports multiple ranges:

```yaml
color:
  red:
    from: 30      # red when >= 30
  orange:
    from: 20
    to: 30        # orange when >= 20 and < 30
  green:
    to: 20        # green when < 20
```

### Step 5: Move section config (if any)

Section-level settings like `sort_by`, `sort_dir`, and `min_width` stay in the `sections[]` array, but without entities.

**v3:**
```yaml
sections:
  - entities:
      - sensor.a
      - sensor.b
    sort_by: state
    min_width: 200
```

**v4:**
```yaml
nodes:
  - id: sensor.a
    section: 0
  - id: sensor.b
    section: 0
sections:
  - sort_by: state
    min_width: 200
```

## Complete Example

### Before (v3)

```yaml
type: custom:sankey-chart
show_names: true
sections:
  - entities:
      - entity_id: sensor.grid
        children:
          - sensor.house
      - entity_id: sensor.solar
        color: orange
        children:
          - sensor.house
  - entities:
      - entity_id: sensor.house
        children:
          - sensor.hvac
          - entity_id: sensor.washer
            connection_entity_id: sensor.washer_power
          - other
      - entity_id: other
        type: remaining_parent_state
        name: Other
  - entities:
      - sensor.hvac
      - sensor.washer
```

### After (v4)

```yaml
type: custom:sankey-chart
show_names: true
nodes:
  # Section 0 - Sources
  - id: sensor.grid
    section: 0
  - id: sensor.solar
    section: 0
    color: orange
  # Section 1 - House
  - id: sensor.house
    section: 1
  - id: other
    section: 1
    type: remaining_parent_state
    name: Other
  # Section 2 - Consumers
  - id: sensor.hvac
    section: 2
  - id: sensor.washer
    section: 2
links:
  - source: sensor.grid
    target: sensor.house
  - source: sensor.solar
    target: sensor.house
  - source: sensor.house
    target: sensor.hvac
  - source: sensor.house
    target: sensor.washer
    value: sensor.washer_power
  - source: sensor.house
    target: other
```

## Tips

1. **Section indices are 0-based** - first section is 0, second is 1, etc.
2. **Links define the flow** - the order of links doesn't matter, but nodes are rendered in the order they appear
3. **Passthrough nodes** can use a custom id now but their links have to be defined with that id
