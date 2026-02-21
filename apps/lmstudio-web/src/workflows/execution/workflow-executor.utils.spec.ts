import { asStringArray, compareStringIds } from './workflow-executor.utils';

describe('workflows/execution/workflow-executor.utils', () => {
  it('asStringArray trims and filters empty-ish values', () => {
    expect(asStringArray([' a ', '', null as any, 1 as any, 'b'])).toEqual(['a', '1', 'b']);
  });

  it('compareStringIds compares by trimmed string value', () => {
    expect(compareStringIds(' b', 'a ')).toBeGreaterThan(0);
    expect(compareStringIds('a', 'a')).toBe(0);
  });
});
