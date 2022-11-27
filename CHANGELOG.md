# Changelog

## [1.3.2](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.3.1...v1.3.2) (2022-11-27)


### Bug Fixes

* **#56:** fix overwriting global hass state bug ([132a725](https://github.com/MindFreeze/ha-sankey-chart/commit/132a7253d29064481c35c7b84581323040895fab))

## [1.3.1](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.3.0...v1.3.1) (2022-11-25)


### Bug Fixes

* fixed rendering order of connections ([e5eb1c1](https://github.com/MindFreeze/ha-sankey-chart/commit/e5eb1c11ec08d104cc1c2a3093f4f8fb3b516eab))

## [1.3.0](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.2.0...v1.3.0) (2022-11-16)


### Features

* allow children of `remaining_parent_state` entities ([2626001](https://github.com/MindFreeze/ha-sankey-chart/commit/2626001ca2f30e51678c82c5ed3369bac43804d3))

## [1.2.0](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.1.1...v1.2.0) (2022-11-15)


### Features

* Energy dashboard integration! See `energy_date_selection` in README ([a8b0e9d](https://github.com/MindFreeze/ha-sankey-chart/commit/a8b0e9d7e462e597a9e4ca7f9fd3a656745fac95))


### Bug Fixes

* negative values are now treated as 0 ([b3abe29](https://github.com/MindFreeze/ha-sankey-chart/commit/b3abe292341ea0f2a19d66ed9041b892781bb945))

## [1.1.1](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.1.0...v1.1.1) (2022-10-27)


### Bug Fixes

* **48:** fixed rendering issue with remaining power ([25fb509](https://github.com/MindFreeze/ha-sankey-chart/commit/25fb5092a63ab637968d510ce54636b2eb195025))

## [1.1.0](https://github.com/MindFreeze/ha-sankey-chart/compare/v1.0.0...v1.1.0) (2022-10-24)


### Features

* **39:** highlight entity connections on hover ([559cf06](https://github.com/MindFreeze/ha-sankey-chart/commit/559cf064c5e35d44b2da33c488c090beeeb24578))

## [1.0.0](https://github.com/MindFreeze/ha-sankey-chart/compare/v0.11.0...v1.0.0) (2022-10-24)


### ⚠ BREAKING CHANGES

* **28:** configurable object locations

### Features

* **15:** show missing parent state via `remaining_child_state` ([96927e1](https://github.com/MindFreeze/ha-sankey-chart/commit/96927e1dadf796b2d54580c537fef0a4ddcd0034))
* **28:** calc all connections first ([8a58ddf](https://github.com/MindFreeze/ha-sankey-chart/commit/8a58ddf92fdd3239cdcbce290b6ddd5c9327df05))
* **28:** configurable object locations ([96927e1](https://github.com/MindFreeze/ha-sankey-chart/commit/96927e1dadf796b2d54580c537fef0a4ddcd0034))


### Bug Fixes

* a few fixes for entity types ([1c75c01](https://github.com/MindFreeze/ha-sankey-chart/commit/1c75c01f18a8f25285d8ac80056a1090e5a815f3))


### Miscellaneous Chores

* release 1.0.0 ([35859ae](https://github.com/MindFreeze/ha-sankey-chart/commit/35859aefe18d04864a46c01d8e3842478c9c517e))

## [0.11.0](https://github.com/MindFreeze/ha-sankey-chart/compare/v0.10.1...v0.11.0) (2022-08-07)


### Features

* [#9](https://github.com/MindFreeze/ha-sankey-chart/issues/9) Allow connections accross sections ([089c319](https://github.com/MindFreeze/ha-sankey-chart/commit/089c319775a03cd297d9c9f04c9957ee9d9baf12))

## [0.10.1](https://github.com/MindFreeze/ha-sankey-chart/compare/v0.10.0...v0.10.1) (2022-08-06)


### Bug Fixes

* lit deprecation warning ([15f9c39](https://github.com/MindFreeze/ha-sankey-chart/commit/15f9c39ea0b5c5efb1223a351a7549c39ec0bb3c))
* package.json version ([4134302](https://github.com/MindFreeze/ha-sankey-chart/commit/41343020b4438d9201633dc946adcbc08e7c9be9))
