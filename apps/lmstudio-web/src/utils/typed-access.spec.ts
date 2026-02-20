import {
  getArray,
  getNumber,
  getRecord,
  getString,
  isRecord,
  safeJsonParse,
  toJsonObject,
  toJsonValue,
} from './typed-access';

describe('typed-access utils', () => {
  it('isRecord identifies plain objects', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it('getRecord/getArray/getString/getNumber return typed values or null', () => {
    const o: any = { rec: { a: 1 }, arr: [1], s: 'x', n: 2 };
    expect(getRecord(o, 'rec')).toEqual({ a: 1 });
    expect(getArray(o, 'arr')).toEqual([1]);
    expect(getString(o, 's')).toBe('x');
    expect(getNumber(o, 'n')).toBe(2);
    expect(getString(o, 'missing')).toBeNull();
  });

  it('safeJsonParse returns null on invalid json', () => {
    expect(safeJsonParse('{')).toBeNull();
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('toJsonValue stringifies unsupported values and recurses into arrays/objects', () => {
    const v = toJsonValue({ a: 1, b: [true, new Date('2020-01-01T00:00:00.000Z')] } as any);
    expect(v).toEqual({ a: 1, b: [true, expect.any(String)] });
    expect((v as any).b[1]).toContain('2020');
  });

  it('toJsonObject drops non-record inputs to empty object', () => {
    expect(toJsonObject(null)).toEqual({});
    expect(toJsonObject([] as any)).toEqual({});
  });
});
