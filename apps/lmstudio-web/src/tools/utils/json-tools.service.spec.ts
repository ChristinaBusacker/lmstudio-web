import { JsonToolsService } from './json-tools.service';

describe('JsonToolsService', () => {
  const svc = new JsonToolsService();

  describe('validate', () => {
    it('returns ok=false when schema is invalid', () => {
      const r = svc.validate({ json: { a: 1 }, schema: null as any });
      expect(r.ok).toBe(false);
    });

    it('parses json strings and validates against schema', () => {
      const schema = {
        type: 'object',
        properties: { a: { type: 'number' } },
        required: ['a'],
        additionalProperties: false,
      };
      const r = svc.validate({ json: '{"a": 1}', schema });
      expect(r).toEqual({ ok: true });
    });

    it('returns structured AJV errors', () => {
      const schema = {
        type: 'object',
        properties: { a: { type: 'number' } },
        required: ['a'],
        additionalProperties: false,
      };
      const r = svc.validate({ json: { a: 'nope' }, schema });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(Array.isArray((r as any).errors)).toBe(true);
        expect((r as any).errors[0]).toHaveProperty('message');
      }
    });
  });

  describe('repair', () => {
    it('fast-path returns repaired=false for valid json', () => {
      const r = svc.repair({ text: '{"a":1}' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.repaired).toBe(false);
        expect(r.json).toEqual({ a: 1 });
      }
    });

    it('repairs trailing commas, single quotes and unquoted keys', () => {
      const broken = "Here you go: { foo: 'bar', list: [1,2,], }";
      const r = svc.repair({ text: broken });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.repaired).toBe(true);
        expect(r.json).toEqual({ foo: 'bar', list: [1, 2] });
        expect(r.repairedText).toContain('"foo"');
      }
    });

    it('returns ok=false when it still cannot be repaired', () => {
      const r = svc.repair({ text: '{ this is not json }' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.repaired).toBe(true);
        expect(typeof (r as any).error).toBe('string');
      }
    });
  });
});
