import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('keeps only the most recent items up to capacity', () => {
    const buf = new RingBuffer<number>(3);

    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);

    buf.push(4);
    expect(buf.toArray()).toEqual([2, 3, 4]);
    expect(buf.size).toBe(3);
  });

  it('clears correctly', () => {
    const buf = new RingBuffer<string>(2);
    buf.push('a');
    buf.push('b');
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });
});
