/* eslint-disable @typescript-eslint/no-unused-vars */

type AttrEl = {
  getAttribute: (name: string) => string | null;
  textContent?: string | null;
  dateTime?: string;
};

type MinimalDocument = {
  querySelector: (sel: string) => AttrEl | null;
  documentElement: { getAttribute: (name: string) => string | null };
};

type MinimalWindow = {
  document: MinimalDocument;
};

function pickAttr(html: string, re: RegExp, group = 1): string | null {
  const m = html.match(re);
  return m?.[group]?.trim() ?? null;
}

function metaByName(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  return pickAttr(html, re);
}

function metaByProp(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  return pickAttr(html, re);
}

function titleText(html: string): string | null {
  return pickAttr(html, /<title[^>]*>([^<]*)<\/title>/i);
}

function htmlLang(html: string): string | null {
  return pickAttr(html, /<html[^>]*lang=["']([^"']+)["'][^>]*>/i);
}

function timeDatetime(html: string): string | null {
  // simplest: first time tag with datetime
  return pickAttr(html, /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i);
}

export class JSDOM {
  public window: MinimalWindow;

  public constructor(
    private readonly html: string = '',
    _opts?: unknown,
  ) {
    const lang = htmlLang(this.html);

    const doc: MinimalDocument = {
      documentElement: {
        getAttribute: (name: string) => (name === 'lang' ? lang : null),
      },
      querySelector: (sel: string) => {
        // title
        if (sel === 'title') {
          const t = titleText(this.html);
          if (!t) return null;
          return { getAttribute: () => null, textContent: t };
        }

        // time[datetime]
        if (sel === 'time[datetime]') {
          const dt = timeDatetime(this.html);
          if (!dt) return null;
          return { getAttribute: () => null, dateTime: dt };
        }

        // meta[name="x"]
        const metaName = sel.match(/^meta\[name="([^"]+)"\]$/);
        if (metaName) {
          const v = metaByName(this.html, metaName[1]!);
          if (!v) return null;
          return { getAttribute: (n: string) => (n === 'content' ? v : null) };
        }

        // meta[property="x"]
        const metaProp = sel.match(/^meta\[property="([^"]+)"\]$/);
        if (metaProp) {
          const v = metaByProp(this.html, metaProp[1]!);
          if (!v) return null;
          return { getAttribute: (n: string) => (n === 'content' ? v : null) };
        }

        return null;
      },
    };

    this.window = { document: doc };
  }
}
