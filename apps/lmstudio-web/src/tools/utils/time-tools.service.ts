import { Injectable } from '@nestjs/common';
import * as chrono from 'chrono-node';

type CurrentTimeArgs = {
  timezone?: string;
};

type ResolveRelativeDateArgs = {
  text: string;
  timezone?: string;
  baseTime?: string;
  forwardDate?: boolean;
};

type DateMathArgs = {
  base?: string;
  timezone?: string;
  add?: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  };
  startOf?: 'day' | 'week' | 'month' | 'year' | string;
  endOf?: 'day' | 'week' | 'month' | 'year' | string;
  roundTo?: 'second' | 'minute' | 'hour' | 'day' | string;
};

function clampIanaTz(tz?: string): string {
  // Very small safety net. If someone passes nonsense, fall back instead of crashing.
  const fallback = 'Europe/Berlin';
  if (!tz) return fallback;
  try {
    // Will throw on invalid timeZone.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return fallback;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseGmtOffsetToMinutes(tzName: string): number {
  // tzName examples: "GMT+1", "GMT+01:00", "GMT-2"
  const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(tzName);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function getOffsetMinutes(instant: Date, timeZone: string): number {
  // Node supports timeZoneName: 'shortOffset' in modern ICU builds.
  // If it doesn't, fall back to 0 (UTC-like). Better than throwing.
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(instant);

    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
    return parseGmtOffsetToMinutes(tzPart);
  } catch {
    return 0;
  }
}

function instantToZonedIso(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const y = get('year') ?? '1970';
  const mo = get('month') ?? '01';
  const d = get('day') ?? '01';
  const h = get('hour') ?? '00';
  const mi = get('minute') ?? '00';
  const s = get('second') ?? '00';

  const offMin = getOffsetMinutes(instant, timeZone);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  const offH = pad2(Math.floor(abs / 60));
  const offM = pad2(abs % 60);

  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${offH}:${offM}`;
}

function zonedComponentsToInstant(
  c: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date {
  // Convert a timezone-local wall clock to an instant.
  // Because offsets can change (DST), do a small correction loop.
  const guessUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  let utc = guessUtc;
  const off = getOffsetMinutes(new Date(utc), timeZone);
  utc = guessUtc - off * 60_000;
  const off2 = getOffsetMinutes(new Date(utc), timeZone);
  if (off2 !== off) {
    utc = guessUtc - off2 * 60_000;
  }
  return new Date(utc);
}

function getZonedParts(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun..6=Sat
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(instant);

  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const weekdayStr = (get('weekday') ?? 'Sun').toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  return {
    year: Number(get('year') ?? 1970),
    month: Number(get('month') ?? 1),
    day: Number(get('day') ?? 1),
    hour: Number(get('hour') ?? 0),
    minute: Number(get('minute') ?? 0),
    second: Number(get('second') ?? 0),
    weekday: weekdayMap[weekdayStr.slice(0, 3)] ?? 0,
  };
}

function startOfUnit(parts: ReturnType<typeof getZonedParts>, unit: string): typeof parts {
  if (unit === 'day') {
    return { ...parts, hour: 0, minute: 0, second: 0 };
  }

  if (unit === 'week') {
    // ISO-ish week start: Monday.
    const weekday = parts.weekday;
    const diff = (weekday + 6) % 7; // Monday=0
    // Keep deterministic via day math, normalization happens later.
    return { ...parts, hour: 0, minute: 0, second: 0, day: parts.day - diff };
  }

  if (unit === 'month') {
    return { ...parts, day: 1, hour: 0, minute: 0, second: 0 };
  }

  if (unit === 'year') {
    return { ...parts, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  }

  return parts;
}

@Injectable()
export class TimeToolsService {
  currentTime(args?: CurrentTimeArgs) {
    const timeZone = clampIanaTz(args?.timezone);
    const now = new Date();
    const iso = instantToZonedIso(now, timeZone);

    return {
      nowIso: iso,
      nowUtcIso: now.toISOString(),
      timezone: timeZone,
      unixMs: now.getTime(),
      offsetMinutes: getOffsetMinutes(now, timeZone),
    };
  }

  resolveRelativeDate(args: ResolveRelativeDateArgs) {
    const timeZone = clampIanaTz(args.timezone);
    const forwardDate = args.forwardDate ?? true;

    const baseInstant = args.baseTime ? new Date(args.baseTime) : new Date();

    const parsed = chrono.parse(args.text, baseInstant, { forwardDate });
    if (!parsed.length) {
      return {
        ok: false,
        timezone: timeZone,
        input: args.text,
        error: 'Could not parse date expression.',
      };
    }

    // Prefer the first result.
    const result = parsed[0];

    // chrono returns Date instants. We'll format them with the requested timezone.
    const start = result.start?.date();
    const end = result.end?.date();

    if (!start) {
      return {
        ok: false,
        timezone: timeZone,
        input: args.text,
        error: 'Parsed expression had no start date.',
      };
    }

    const pickComponents = (c: any) => {
      if (!c) return null;
      const keys = [
        'year',
        'month',
        'day',
        'hour',
        'minute',
        'second',
        'millisecond',
        'timezoneOffset',
      ];
      const out: Record<string, number | null> = {};
      for (const k of keys) {
        const v = c.get ? c.get(k) : undefined;
        out[k] = typeof v === 'number' ? v : null;
      }
      return out;
    };

    return {
      ok: true,
      timezone: timeZone,
      input: args.text,
      startIso: instantToZonedIso(start, timeZone),
      endIso: end ? instantToZonedIso(end, timeZone) : null,
      // Useful for debugging why the model got it wrong.
      components: {
        start: pickComponents(result.start),
        end: pickComponents(result.end),
      },
    };
  }

  dateMath(args: DateMathArgs) {
    const timeZone = clampIanaTz(args.timezone);
    const baseInstant = args.base ? new Date(args.base) : new Date();

    // Convert base instant to zoned parts.
    let parts = getZonedParts(baseInstant, timeZone);

    // Add fields.
    const add = args.add ?? {};
    if (add.years) parts.year += add.years;
    if (add.months) parts.month += add.months;
    if (add.weeks) parts.day += add.weeks * 7;
    if (add.days) parts.day += add.days;
    if (add.hours) parts.hour += add.hours;
    if (add.minutes) parts.minute += add.minutes;
    if (add.seconds) parts.second += add.seconds;

    // Normalize by converting through an instant and back.
    // This lets JS handle overflows (e.g., day 40) in UTC, then we re-zone.
    const normalizedInstant = zonedComponentsToInstant(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
      },
      timeZone,
    );

    parts = getZonedParts(normalizedInstant, timeZone);

    if (args.startOf) {
      parts = startOfUnit(parts, args.startOf);
    }

    // endOf is startOf(next unit) - 1 second.
    if (args.endOf) {
      const start = startOfUnit(parts, args.endOf);
      const next = { ...start };
      if (args.endOf === 'day') next.day += 1;
      if (args.endOf === 'week') next.day += 7;
      if (args.endOf === 'month') next.month += 1;
      if (args.endOf === 'year') next.year += 1;
      const nextInstant = zonedComponentsToInstant(
        {
          year: next.year,
          month: next.month,
          day: next.day,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone,
      );
      const endInstant = new Date(nextInstant.getTime() - 1000);
      return {
        ok: true,
        timezone: timeZone,
        base: instantToZonedIso(baseInstant, timeZone),
        resultIso: instantToZonedIso(endInstant, timeZone),
        resultUtcIso: endInstant.toISOString(),
        unixMs: endInstant.getTime(),
      };
    }

    // Rounding.
    if (args.roundTo) {
      const inst = zonedComponentsToInstant(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: parts.hour,
          minute: parts.minute,
          second: parts.second,
        },
        timeZone,
      );
      const ms = inst.getTime();
      const roundMs =
        args.roundTo === 'second'
          ? 1000
          : args.roundTo === 'minute'
            ? 60_000
            : args.roundTo === 'hour'
              ? 3_600_000
              : args.roundTo === 'day'
                ? 86_400_000
                : null;
      if (roundMs) {
        const rounded = Math.round(ms / roundMs) * roundMs;
        const out = new Date(rounded);
        return {
          ok: true,
          timezone: timeZone,
          base: instantToZonedIso(baseInstant, timeZone),
          resultIso: instantToZonedIso(out, timeZone),
          resultUtcIso: out.toISOString(),
          unixMs: out.getTime(),
        };
      }
    }

    const resultInstant = zonedComponentsToInstant(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
      },
      timeZone,
    );

    return {
      ok: true,
      timezone: timeZone,
      base: instantToZonedIso(baseInstant, timeZone),
      resultIso: instantToZonedIso(resultInstant, timeZone),
      resultUtcIso: resultInstant.toISOString(),
      unixMs: resultInstant.getTime(),
    };
  }
}
