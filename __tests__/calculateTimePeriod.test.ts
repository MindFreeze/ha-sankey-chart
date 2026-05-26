import { calculateTimePeriod } from '../src/utils';

describe('calculateTimePeriod', () => {
  // Tuesday, May 26, 2026, 15:30:45 local time
  const NOW = new Date(2026, 4, 26, 15, 30, 45);

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('returns now for "now"', () => {
    const { start, end } = calculateTimePeriod('now', 'now');
    expect(start.getTime()).toBe(NOW.getTime());
    expect(end.getTime()).toBe(NOW.getTime());
  });

  test('defaults `to` to "now"', () => {
    const { end } = calculateTimePeriod('now-1h');
    expect(end.getTime()).toBe(NOW.getTime());
  });

  test('parses a negative offset', () => {
    const { start } = calculateTimePeriod('now-1h');
    expect(start).toEqual(new Date(2026, 4, 26, 14, 30, 45));
  });

  test('parses a positive offset', () => {
    const { start } = calculateTimePeriod('now+30m');
    expect(start).toEqual(new Date(2026, 4, 26, 16, 0, 45));
  });

  test('rounds to start of day', () => {
    const { start } = calculateTimePeriod('now/d');
    expect(start).toEqual(new Date(2026, 4, 26, 0, 0, 0));
  });

  test('offset before rounding gives yesterday midnight', () => {
    const { start, end } = calculateTimePeriod('now-1d/d', 'now/d');
    expect(start).toEqual(new Date(2026, 4, 25, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 4, 26, 0, 0, 0));
  });

  test('rounding then offset gives today at 07:00', () => {
    const { start } = calculateTimePeriod('now/d+7h');
    expect(start).toEqual(new Date(2026, 4, 26, 7, 0, 0));
  });

  test('offset, rounding, offset gives yesterday at 23:00', () => {
    const { start } = calculateTimePeriod('now-1d/d+23h');
    expect(start).toEqual(new Date(2026, 4, 25, 23, 0, 0));
  });

  test('rounding with negative offset gives yesterday at 23:00', () => {
    const { start } = calculateTimePeriod('now/d-1h');
    expect(start).toEqual(new Date(2026, 4, 25, 23, 0, 0));
  });

  test('quiet hours window: 23:00 yesterday -> 07:00 today', () => {
    const { start, end } = calculateTimePeriod('now-1d/d+23h', 'now/d+7h');
    expect(start).toEqual(new Date(2026, 4, 25, 23, 0, 0));
    expect(end).toEqual(new Date(2026, 4, 26, 7, 0, 0));
  });

  test.each(['nope', 'now+', 'now-1', 'now1h', 'now/x', 'nowxx', 'now/'])(
    'throws on invalid input %s',
    (input) => {
      expect(() => calculateTimePeriod(input)).toThrow('Invalid time format');
    },
  );
});
