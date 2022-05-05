# Sankey Chart Card

A Home Assistant lovelace card to display a sankey chart. For example for power consumption

[![GitHub Release][releases-shield]][releases]
[![License][license-shield]](LICENSE.md)
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)

![Project Maintenance][maintenance-shield]
[![GitHub Activity][commits-shield]][commits]

![Example card](img/example.png)

## Options

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| type              | string  | **Required** |                     | `custom:sankey-chart`
| sections          | list    | **Required** |                     | Entities to show divided by sections, see [sections object](#sections-object) for additional options.
| unit_prefix       | string  | **Optional** |                     | Metric prefix for the unit of measurment. See <https://en.wikipedia.org/wiki/Unit_prefix> . Supported values are m, k, M, G, T
| round             | number  | **Optional** | 0                   | Round the value to at most N decimal places.
| height            | number  | **Optional** | 200                 | The height of the card in pixels
| wide              | boolean | **Optional** | false               | Set this to true if you see extra empty space in the right side of the card. This will expand it horizontally to cover all the available space. Enable if you see empty space on the right size.
| show_icons        | boolean | **Optional** | false               | Display entity icons
| show_names        | boolean | **Optional** | false               | Display entity names
| min_box_height    | number  | **Optional** | 3                   | Minimum size of an entity box
| min_box_distance  | number  | **Optional** | 5                   | Minimum space between entity boxes

### Sections object

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| entities          | list    | **Required** |                     | Entities to show in this section. Could be just the entity_id as a string or an object, see [entities object](#entities-object) for additional options. Note that the order of this list matters

### Entities object

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| entity_id         | string  | **Required** |                     | Entity id of the sensor
| children          | list    | **Required** |                     | List of entity ids describing child entities (branches). Only entities from the next section will be connected.
| color             | string  | **Optional** | var(--primary-color)| Color of the box
| name              | string  | **Optional** | entity name from HA | Custom label for this entity

## Examples

### Simple

![Simple example card](img/example-simple.png)

```yaml
- type: custom:sankey-chart
  show_names: true
  sections:
    - entities:
      - entity_id: sensor.power
        children:
          - sensor.washing_machine_power
          - sensor.other_power
    - entities:
      - sensor.washing_machine_power
      - sensor.other_power
```

### Daily energy use

![Energy example card](img/example-energy.png)

```yaml
- type: custom:sankey-chart
  show_names: true
  unit_prefix: k
  round: 1
  wide: true
  sections:
    - entities:
        - entity_id: sensor.solar
          color: var(--warning-color)
          children:
            - sensor.daily_energy
        - entity_id: sensor.grid
          children:
            - sensor.daily_energy
        - entity_id: sensor.battery
          color: var(--success-color)
          children:
            - sensor.daily_energy
    - entities:
        - entity_id: sensor.daily_energy
          children:
            - sensor.floor1
            - sensor.floor2
            - sensor.garage
    - entities:
        - entity_id: sensor.floor1
          children:
            - sensor.living_room
            - sensor.washer
        - entity_id: sensor.floor2
        - entity_id: sensor.garage
          color: purple
          children:
            - sensor.ev_charger
    - entities:
        - sensor.living_room
        - sensor.washer
        - sensor.ev_charger
```

## Development

1. `npm i`
2. `npm start`
3. The compiled `.js` file will be accessible on
   `http://127.0.0.1:5000/ha-sankey-chart.js`.
4. On a running Home Assistant installation add this to your Lovelace `resources:`

```yaml
- url: 'http://127.0.0.1:5000/ha-sankey-chart.js'
  type: module
```

## TODO

- specify connection entities (for size of connector)
- option to throttle updates
- connections accross sections?

[commits-shield]: https://img.shields.io/github/commit-activity/y/MindFreeze/ha-sankey-chart.svg?style=for-the-badge
[commits]: https://github.com//MindFreeze/ha-sankey-chart/commits/master
[devcontainer]: https://code.visualstudio.com/docs/remote/containers
[license-shield]: https://img.shields.io/github/license/MindFreeze/ha-sankey-chart.svg?style=for-the-badge
[maintenance-shield]: https://img.shields.io/maintenance/yes/2022.svg?style=for-the-badge
[releases-shield]: https://img.shields.io/github/release/MindFreeze/ha-sankey-chart.svg?style=for-the-badge
[releases]: https://github.com/MindFreeze/ha-sankey-chart/releases
