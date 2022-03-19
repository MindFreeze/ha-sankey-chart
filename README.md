# Sankey Chart Card

A Home Assistant lovelace card to display a sankey chart. For example for power consumption

[![GitHub Release][releases-shield]][releases]
[![License][license-shield]](LICENSE.md)
[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg?style=for-the-badge)](https://github.com/custom-components/hacs)

![Project Maintenance][maintenance-shield]
[![GitHub Activity][commits-shield]][commits]

## Options

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| type              | string  | **Required** |                     | `custom:sankey-chart`
| sections          | list    | **Required** |                     | Entities to show divided by sections, see [sections object](#sections-object) for additional options.
| height            | number  | **Optional** | 200                 | The height of the card in pixels

#### Sections object

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| entities          | list    | **Required** |                     | Entities to show in this section. Could be just the entity_id as a string or an object, see [entities object](#entities-object) for additional options.

#### Entities object

| Name              | Type    | Requirement  | Default             | Description                                 |
| ----------------- | ------- | ------------ | ------------------- | ------------------------------------------- |
| entity_id         | string  | **Required** |                     | Entity id of the sensor
| parents           | list    | **Required** |                     | List of entity ids describing parent entities

## Development

1. `npm i`
2. `npm start`
3. The compiled `.js` file will be accessible on
   `http://127.0.0.1:5000/sankey-chart.js`.
4. On a running Home Assistant installation add this to your Lovelace `resources:`

```yaml
- url: 'http://127.0.0.1:5000/sankey-chart.js'
  type: module
```

_Change "127.0.0.1" to the IP of your development machine._

[commits-shield]: https://img.shields.io/github/commit-activity/y/custom-cards/sankey-chart.svg?style=for-the-badge
[commits]: https://github.com/custom-cards/sankey-chart/commits/master
[devcontainer]: https://code.visualstudio.com/docs/remote/containers
[license-shield]: https://img.shields.io/github/license/custom-cards/sankey-chart.svg?style=for-the-badge
[maintenance-shield]: https://img.shields.io/maintenance/yes/2022.svg?style=for-the-badge
[releases-shield]: https://img.shields.io/github/release/custom-cards/sankey-chart.svg?style=for-the-badge
[releases]: https://github.com/custom-cards/sankey-chart/releases
