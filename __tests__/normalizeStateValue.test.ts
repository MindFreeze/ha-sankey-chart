import { normalizeStateValue } from '../src/utils';

describe('normalizeStateValue', () => {
  // Test with no unit of measurement
  test('returns original state when no unit of measurement is provided', () => {
    const result = normalizeStateValue('', 123, undefined);
    expect(result).toEqual({ state: 123, unit_of_measurement: undefined });
  });

  // Test with monetary unit
  test('returns original state when unit is monetary', () => {
    const result = normalizeStateValue('', 123, 'monetary');
    expect(result).toEqual({ state: 123, unit_of_measurement: 'monetary' });
  });

  // Test with negative values
  test('handles negative values by converting to zero', () => {
    const result = normalizeStateValue('', -123, 'W');
    expect(result).toEqual({ state: 0, unit_of_measurement: 'W' });
  });

  // Test with NaN
  test('handles NaN values by converting to zero', () => {
    const result = normalizeStateValue('', NaN, 'W');
    expect(result).toEqual({ state: 0, unit_of_measurement: 'W' });
  });

  // Test with explicit unit prefixes
  test('converts values with explicit unit prefixes', () => {
    // No conversion needed (same prefix)
    let result = normalizeStateValue('k', 5, 'kW');
    expect(result).toEqual({ state: 5, unit_of_measurement: 'kW' });

    // Convert from kW to W
    result = normalizeStateValue('', 5, 'kW');
    expect(result).toEqual({ state: 5000, unit_of_measurement: 'W' });

    // Convert from W to kW
    result = normalizeStateValue('k', 5000, 'W');
    expect(result).toEqual({ state: 5, unit_of_measurement: 'kW' });

    // Convert from MW to kW
    result = normalizeStateValue('k', 5, 'MW');
    expect(result).toEqual({ state: 5000, unit_of_measurement: 'kW' });
  });

  // Test adding a prefix to a unit without one
  test('adds prefix to unit without one', () => {
    const result = normalizeStateValue('k', 5000, 'W');
    expect(result).toEqual({ state: 5, unit_of_measurement: 'kW' });
  });

  // Test auto unit prefix selection when enableAutoPrefix is true
  describe('auto unit prefix selection (enableAutoPrefix=true)', () => {
    // Test values less than 1 (should use milli)
    test('selects milli prefix for values < 1', () => {
      const result = normalizeStateValue('auto', 0.123, 'W', true);
      expect(result.unit_of_measurement).toBe('mW');
      expect(result.state).toBeCloseTo(123);
    });

    // Test values 1-999 (should use no prefix)
    test('selects no prefix for values between 1 and 999', () => {
      const result = normalizeStateValue('auto', 123, 'W', true);
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(123);
    });

    // Test values 1000-999999 (should use kilo)
    test('selects kilo prefix for values between 1000 and 999999', () => {
      const result = normalizeStateValue('auto', 123000, 'W', true);
      expect(result.unit_of_measurement).toBe('kW');
      expect(result.state).toBe(123);
    });

    // Test values 1000000-999999999 (should use mega)
    test('selects mega prefix for values between 1000000 and 999999999', () => {
      const result = normalizeStateValue('auto', 123000000, 'W', true);
      expect(result.unit_of_measurement).toBe('MW');
      expect(result.state).toBe(123);
    });

    // Test values 1000000000-999999999999 (should use giga)
    test('selects giga prefix for values between 1000000000 and 999999999999', () => {
      const result = normalizeStateValue('auto', 123000000000, 'W', true);
      expect(result.unit_of_measurement).toBe('GW');
      expect(result.state).toBe(123);
    });

    // Test values >= 1000000000000 (should use tera)
    test('selects tera prefix for values >= 1000000000000', () => {
      const result = normalizeStateValue('auto', 123000000000000, 'W', true);
      expect(result.unit_of_measurement).toBe('TW');
      expect(result.state).toBe(123);
    });

    // Test with input that already has a prefix
    test('handles input with existing prefix', () => {
      // 5 kW (5000 W) should be displayed as 5 kW
      let result = normalizeStateValue('auto', 5, 'kW', true);
      expect(result.unit_of_measurement).toBe('kW');
      expect(result.state).toBe(5);

      // 5000 kW (5000000 W) should be displayed as 5 MW
      result = normalizeStateValue('auto', 5000, 'kW', true);
      expect(result.unit_of_measurement).toBe('MW');
      expect(result.state).toBe(5);

      // 0.001 kW (1 W) should be displayed as 1 W
      result = normalizeStateValue('auto', 0.001, 'kW', true);
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(1);

      // 0.0005 kW (0.5 W) should be displayed as 500 mW
      result = normalizeStateValue('auto', 0.0005, 'kW', true);
      // In the current implementation, the function replaces 'k' with 'm'
      expect(result.unit_of_measurement).toBe('mW');
      expect(result.state).toBe(500);
    });
  });

  // Test auto unit prefix option when enableAutoPrefix is false (default)
  describe('auto unit prefix selection (enableAutoPrefix=false)', () => {
    test('uses empty prefix when auto is set but enableAutoPrefix is false', () => {
      // With no existing prefix
      let result = normalizeStateValue('auto', 123000, 'W', false);
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(123000);

      // With existing prefix (should be preserved)
      result = normalizeStateValue('auto', 5, 'kW', false);
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(5000);
    });

    test('uses empty prefix when auto is set but enableAutoPrefix is omitted', () => {
      // With no existing prefix
      let result = normalizeStateValue('auto', 123000, 'W');
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(123000);

      // With existing prefix (should be preserved)
      result = normalizeStateValue('auto', 5, 'kW');
      expect(result.unit_of_measurement).toBe('W');
      expect(result.state).toBe(5000);
    });
  });
}); 