import { formatState } from '../src/utils';
import { FrontendLocaleData, NumberFormat, TimeFormat } from 'custom-card-helpers';

describe('formatState', () => {
  // Mock locale data for consistent testing
  const mockLocale: FrontendLocaleData = {
    language: 'en',
    number_format: NumberFormat.language,
    time_format: TimeFormat.am_pm,
  };

  test('formats regular numbers with specified rounding', () => {
    expect(formatState(123.456, 2, mockLocale)).toBe('123.46');
    expect(formatState(123.456, 1, mockLocale)).toBe('123.5');
    expect(formatState(123.456, 0, mockLocale)).toBe('123');
  });

  test('handles very small numbers by increasing decimal places', () => {
    expect(formatState(0.000123, 2, mockLocale)).toBe('0.0001');
    expect(formatState(0.00000123, 2, mockLocale)).toBe('0.000001');
  });

  test('handles zero values', () => {
    expect(formatState(0, 2, mockLocale)).toBe('0');
    expect(formatState(0, 1, mockLocale)).toBe('0');
    expect(formatState(0, 0, mockLocale)).toBe('0');
  });

  test('handles negative values', () => {
    expect(formatState(-123.456, 2, mockLocale)).toBe('-123.46');
    expect(formatState(-0.000123, 2, mockLocale)).toBe('-0');
  });

  test('formats monetary values correctly', () => {
    expect(formatState(123.456, 2, mockLocale, 'USD')).toBe('$123.46');
    expect(formatState(1234.56, 2, mockLocale, 'USD')).toBe('$1,234.56');
    expect(formatState(0.000123, 2, mockLocale, 'USD')).toBe('$0.0001');
  });

  test('handles NaN values', () => {
    expect(formatState(NaN, 2, mockLocale)).toBe('NaN');
    expect(formatState(NaN, 2, mockLocale, 'USD')).toBe('NaN USD');
  });

  test('handles different locales', () => {
    const germanLocale: FrontendLocaleData = {
      language: 'de',
      number_format: NumberFormat.decimal_comma,
      time_format: TimeFormat.twenty_four,
    };

    const result = formatState(1234.56, 2, germanLocale, 'EUR');
    expect(result).toContain('1.234,56');
    expect(result).toContain('€');
    
    const result2 = formatState(0.0000001, 2, germanLocale, 'EUR');
    expect(result2).toContain('0,0000001');
    expect(result2).toContain('€');

    const result3 = formatState(5385.16025, 2, germanLocale);
    expect(result3).toBe('5.385,16');
  });
}); 