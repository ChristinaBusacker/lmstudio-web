import { Injectable } from '@nestjs/common';
import Ajv, { type ErrorObject } from 'ajv';
import { normalizeError } from '../../common/utils/error.util';

@Injectable()
export class JsonToolsService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

  validate(args: { json: unknown; schema: Record<string, any> }) {
    try {
      const schema = args.schema;
      if (!schema || typeof schema !== 'object') {
        return { ok: false, error: 'Schema must be an object.' };
      }

      let data: unknown = args.json;
      if (typeof data === 'string') {
        const raw = data.trim();
        try {
          data = JSON.parse(raw);
        } catch {
          return { ok: false, error: 'json is a string but is not valid JSON.' };
        }
      }

      const validate = this.ajv.compile(schema);
      const ok = validate(data) as boolean;

      if (ok) {
        return { ok: true };
      }

      const errors = (validate.errors ?? []).map((e: ErrorObject) => ({
        path: e.instancePath || e.schemaPath,
        message: e.message ?? 'invalid',
        keyword: e.keyword,
        params: e.params,
      }));

      return {
        ok: false,
        errors,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        error: normalizeError(e).message ?? 'Validation failed.',
      };
    }
  }

  repair(args: { text: string }) {
    const input = String(args.text ?? '').trim();
    if (!input) return { ok: false, error: 'text is empty.' };

    // Fast path
    try {
      const json = JSON.parse(input);
      return { ok: true, repaired: false, json };
    } catch {
      // continue
    }

    // Try a few deterministic repairs. The point is not to be "clever", it's to be useful.
    let candidate = input;

    // Extract first JSON object/array if surrounded by prose.
    const match = /([\[{][\s\S]*[\]}])/.exec(candidate);
    if (match?.[1]) candidate = match[1];

    // Remove trailing commas before } or ]
    candidate = candidate.replace(/,\s*([}\]])/g, '$1');

    // Convert single quotes to double quotes when it looks like JSON strings.
    // This is intentionally conservative: only replace quotes that wrap string content.
    candidate = candidate.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => {
      const safe = String(inner).replace(/"/g, '\\"');
      return `"${safe}"`;
    });

    // Quote unquoted keys: { foo: 1 } => { "foo": 1 }
    // Keep it conservative: only plain identifiers before a colon.
    candidate = candidate.replace(/([\{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:\s*)/g, '$1"$2"$3');

    // Replace NaN/Infinity with null (JSON doesn't support them)
    candidate = candidate.replace(/\bNaN\b/g, 'null');
    candidate = candidate.replace(/\bInfinity\b/g, 'null');
    candidate = candidate.replace(/\b-Infinity\b/g, 'null');

    try {
      const json = JSON.parse(candidate);
      return {
        ok: true,
        repaired: true,
        json,
        repairedText: candidate,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        repaired: true,
        error: normalizeError(e).message ?? 'Could not repair JSON.',
        repairedText: candidate,
      };
    }
  }
}
