/**
 * A SYNTHETIC Scryfall for the import tests. No real card data: every card is generated from its
 * name ("Synthetic ..." names, ids starting with `synthetic-`). The HTTP behavior follows D-048:
 * `POST /cards/collection` takes at most 75 identifiers, matches a multi-faced card only by its
 * FRONT-face name, lists unknown names in `not_found` as `{name}` and answers in request order;
 * `GET /cards/named?exact=` and `?fuzzy=` answer one card or 404.
 *
 * Names it knows:
 * - the five basic lands (`Forest`, `Island`, `Mountain`, `Plains`, `Swamp`);
 * - `Synthetic Vanilla N`: green creature with no text (the parser supports it);
 * - `Synthetic Flyer N`: green creature with Flying (a keyword line, supported);
 * - `Synthetic Oddity N`: green creature whose text the parser cannot read (unsupported);
 * - `Synthetic Tapland N`: land with "{T}: Add {G}." (supported); `Synthetic Odd Land N`: land with
 *   text the parser cannot read (unsupported);
 * - `Synthetic Commander` (green) and `Synthetic Red Commander`: legendary creatures;
 * - `Synthetic Daybreak // Synthetic Nightfall`: a meld card (a layout the engine refuses), found by `Synthetic Daybreak`.
 */

export interface FakeCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

export interface FakeScryfallOptions {
  /** Lower-case requested name to the name of the card `?fuzzy=` answers with. */
  readonly fuzzy?: Readonly<Record<string, string>>;
  /** Throw a network error for every request (offline). */
  readonly offline?: boolean;
  /**
   * Give every `Synthetic Oddity N` the text `Flying` instead of text the parser cannot read, as
   * if a later release of the card data (or of the parser's reach) made it understandable.
   */
  readonly readableOddities?: boolean;
}

export interface FakeScryfall {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly calls: FakeCall[];
}

type Raw = Record<string, unknown>;

const BASICS: Readonly<Record<string, { color: string; subtype: string }>> = {
  plains: { color: 'W', subtype: 'Plains' },
  island: { color: 'U', subtype: 'Island' },
  swamp: { color: 'B', subtype: 'Swamp' },
  mountain: { color: 'R', subtype: 'Mountain' },
  forest: { color: 'G', subtype: 'Forest' },
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function base(name: string, extra: Raw): Raw {
  return {
    object: 'card',
    id: `synthetic-id-${slug(name)}`,
    oracle_id: `synthetic-oracle-${slug(name)}`,
    name,
    layout: 'normal',
    mana_cost: '',
    cmc: 0,
    legalities: { commander: 'legal' },
    keywords: [],
    edhrec_rank: 1000,
    image_uris: {
      normal: `https://cards.synthetic.invalid/${slug(name)}/normal.jpg`,
      large: `https://cards.synthetic.invalid/${slug(name)}/large.jpg`,
      art_crop: `https://cards.synthetic.invalid/${slug(name)}/art.jpg`,
    },
    ...extra,
  };
}

function creature(name: string, text: string, extra: Raw = {}): Raw {
  return base(name, {
    mana_cost: '{1}{G}',
    cmc: 2,
    type_line: 'Creature — Synthetic Beast',
    oracle_text: text,
    power: '2',
    toughness: '2',
    colors: ['G'],
    color_identity: ['G'],
    ...extra,
  });
}

function land(name: string, text: string): Raw {
  return base(name, {
    type_line: 'Land',
    oracle_text: text,
    colors: [],
    color_identity: [],
    produced_mana: ['G'],
  });
}

/** The card a name stands for, or undefined for a name this fake does not know. */
export function syntheticCardNamed(
  name: string,
  options: Pick<FakeScryfallOptions, 'readableOddities'> = {},
): Raw | undefined {
  const key = name.trim().toLowerCase();
  const basic = BASICS[key];
  if (basic) {
    const proper = basic.subtype;
    return base(proper, {
      type_line: `Basic Land — ${basic.subtype}`,
      oracle_text: `({T}: Add {${basic.color}}.)`,
      colors: [],
      color_identity: [basic.color],
      produced_mana: [basic.color],
    });
  }
  const numbered = /^synthetic (vanilla|flyer|oddity|tapland|odd land) (\d+)$/i.exec(name.trim());
  if (numbered?.[1] && numbered[2]) {
    const label = `Synthetic ${numbered[1][0]?.toUpperCase()}${numbered[1].slice(1).toLowerCase()} ${numbered[2]}`;
    switch (numbered[1].toLowerCase()) {
      case 'vanilla':
        return creature(label, '');
      case 'flyer':
        return creature(label, 'Flying', { keywords: ['Flying'] });
      case 'oddity':
        return options.readableOddities
          ? creature(label, 'Flying', { keywords: ['Flying'] })
          : creature(label, `Whenever ${label} wanders, frobnicate the quux twice.`);
      case 'tapland':
        return land(label, '{T}: Add {G}.');
      default:
        return land(
          label.replace('Odd land', 'Odd Land'),
          'Synthetic Odd Land enters frobnicated.',
        );
    }
  }
  if (key === 'synthetic commander') {
    return creature('Synthetic Commander', 'Vigilance', {
      type_line: 'Legendary Creature — Synthetic Hero',
      keywords: ['Vigilance'],
    });
  }
  if (key === 'synthetic red commander') {
    return creature('Synthetic Red Commander', '', {
      type_line: 'Legendary Creature — Synthetic Hero',
      mana_cost: '{1}{R}',
      colors: ['R'],
      color_identity: ['R'],
    });
  }
  if (key === 'synthetic daybreak' || key === 'synthetic daybreak // synthetic nightfall') {
    const face = (faceName: string, cost: string, power: string) => ({
      object: 'card_face',
      name: faceName,
      mana_cost: cost,
      type_line: 'Creature — Synthetic Beast',
      oracle_text: '',
      power,
      toughness: power,
      colors: ['G'],
    });
    return base('Synthetic Daybreak // Synthetic Nightfall', {
      layout: 'meld',
      cmc: 3,
      color_identity: ['G'],
      card_faces: [face('Synthetic Daybreak', '{2}{G}', '2'), face('Synthetic Nightfall', '', '4')],
    });
  }
  return undefined;
}

function frontOf(card: Raw): string {
  const faces = card.card_faces as { name: string }[] | undefined;
  return (faces?.[0]?.name ?? String(card.name)).toLowerCase();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const NOT_FOUND = { object: 'error', status: 404, code: 'not_found', details: 'No match.' };

/** The fake `fetch` and the list of calls it received. */
export function createFakeScryfall(options: FakeScryfallOptions = {}): FakeScryfall {
  const calls: FakeCall[] = [];
  return {
    calls,
    async fetch(url, init) {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      if (options.offline) throw new TypeError('synthetic network failure');
      const parsed = new URL(url);
      if (parsed.pathname === '/cards/collection') {
        const identifiers = (body as { identifiers: { name: string }[] }).identifiers;
        if (identifiers.length > 75) return json({ object: 'error', status: 400 }, 400);
        const data: Raw[] = [];
        const notFound: { name: string }[] = [];
        for (const { name } of identifiers) {
          const card = syntheticCardNamed(name, options);
          // D-048: multi-faced cards match by front-face name only; single-faced by full name.
          const matches =
            card !== undefined &&
            (card.card_faces === undefined
              ? String(card.name).toLowerCase() === name.trim().toLowerCase()
              : frontOf(card) === name.trim().toLowerCase());
          if (card !== undefined && matches) data.push(card);
          else notFound.push({ name });
        }
        return json({ object: 'list', not_found: notFound, data });
      }
      if (parsed.pathname === '/cards/named') {
        const exact = parsed.searchParams.get('exact');
        const fuzzy = parsed.searchParams.get('fuzzy');
        if (exact !== null) {
          const card = syntheticCardNamed(exact, options);
          return card ? json(card) : json(NOT_FOUND, 404);
        }
        if (fuzzy !== null) {
          const target = options.fuzzy?.[fuzzy.toLowerCase()];
          const card = target === undefined ? undefined : syntheticCardNamed(target, options);
          return card ? json(card) : json(NOT_FOUND, 404);
        }
      }
      return json(NOT_FOUND, 404);
    },
  };
}

/** A virtual clock: `sleep` advances time at once, so rate limiting costs no real time. */
export function createVirtualClock(start = 1_800_000_000_000): {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  advance: (ms: number) => void;
} {
  let time = start;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    advance: (ms) => {
      time += ms;
    },
  };
}
