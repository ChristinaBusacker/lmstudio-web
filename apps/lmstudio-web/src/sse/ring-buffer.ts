export class RingBuffer<T> {
  private readonly buffer: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T) {
    if (this.buffer.length >= this.capacity) this.buffer.shift();
    this.buffer.push(item);
  }

  toArray(): T[] {
    return [...this.buffer];
  }

  clear() {
    this.buffer.length = 0;
  }

  get size(): number {
    return this.buffer.length;
  }
}
