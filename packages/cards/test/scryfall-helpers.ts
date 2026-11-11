/**
 * Test helpers of the Scryfall client tests. SYNTHETIC: every card object, id and name built here
 * is invented ("Synthetic ..." names, ids starting with `synthetic-`); none is real Scryfall data.
 * Responses imitate only the SHAPES documented in D-048.
 */

// ---------------------------------------------------------------- a virtual clock

export interface FakeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Every `sleep` request, in order. */
  readonly sleeps: number[];
  /** Runs `promise` to completion, advancing the virtual time whenever everything else waits. */
  run<T>(promise: Promise<T>): Promise<T>;
}

export function createFakeClock(start = 1_000_000): FakeClock {
  let time = start;
  const sleeps: number[] = [];
  const waiters: { wake: number; resolve: () => void }[] = [];
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    now: () => time,
    sleep(ms) {
      sleeps.push(ms);
      return new Promise<void>((resolve) => {
        waiters.push({ wake: time + ms, resolve });
      });
    },
    sleeps,
    async run(promise) {
      let settled = false;
      const watched = promise.finally(() => {
        settled = true;
      });
      watched.catch(() => undefined);
      while (!settled) {
        await flush();
        if (settled) break;
        waiters.sort((a, b) => a.wake - b.wake);
        const next = waiters.shift();
        if (!next) {
          await flush();
          if (settled) break;
          throw new Error('deadlock: nothing is waiting on the virtual clock');
        }
        time = Math.max(time, next.wake);
        next.resolve();
      }
      return promise;
    },
  };
}

// ---------------------------------------------------------------- a recording fetch

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  /** The parsed JSON body of a POST. */
  readonly body: unknown;
  /** The virtual time at which the call was made. */
  readonly at: number;
}

export type Handler = (call: RecordedCall, index: number) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly calls: RecordedCall[];
}

export function createFakeFetch(clock: FakeClock, handler: Handler): FakeFetch {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async fetch(url, init) {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
        headers[name] = value;
      }
      const call: RecordedCall = {
        url,
        method: init.method ?? 'GET',
        headers,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        at: clock.now(),
      };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------- synthetic card objects

export type RawCard = Record<string, unknown>;

const SYNTHETIC_IMAGES = (label: string) => ({
  small: `https://cards.synthetic.invalid/${label}/small.jpg`,
  normal: `https://cards.synthetic.invalid/${label}/normal.jpg`,
  large: `https://cards.synthetic.invalid/${label}/large.jpg`,
  png: `https://cards.synthetic.invalid/${label}/card.png`,
  art_crop: `https://cards.synthetic.invalid/${label}/art.jpg`,
  border_crop: `https://cards.synthetic.invalid/${label}/border.jpg`,
});

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** A single-faced card object with every field the app stores. */
export function syntheticCard(name: string, extra: RawCard = {}): RawCard {
  return {
    object: 'card',
    id: `synthetic-id-${slug(name)}`,
    oracle_id: `synthetic-oracle-${slug(name)}`,
    name,
    layout: 'normal',
    mana_cost: '{1}{G}',
    cmc: 2,
    type_line: 'Creature — Synthetic Beast',
    oracle_text: 'Synthetic rules text.',
    power: '2',
    toughness: '2',
    colors: ['G'],
    color_identity: ['G'],
    keywords: [],
    produced_mana: ['G'],
    legalities: { commander: 'legal', modern: 'legal' },
    edhrec_rank: 1234,
    game_changer: false,
    image_uris: SYNTHETIC_IMAGES(slug(name)),
    artist: 'Synthetic Artist',
    rulings_uri: `https://api.scryfall.com/cards/synthetic-id-${slug(name)}/rulings`,
    some_future_field: { nested: true },
    ...extra,
  };
}

/** A transform-style card whose faces carry their own images. */
export function syntheticDoubleFaced(front: string, back: string, extra: RawCard = {}): RawCard {
  const full = `${front} // ${back}`;
  return {
    object: 'card',
    id: `synthetic-id-${slug(full)}`,
    oracle_id: `synthetic-oracle-${slug(full)}`,
    name: full,
    layout: 'transform',
    cmc: 3,
    colors: undefined,
    color_identity: ['R', 'G'],
    keywords: ['Flying'],
    legalities: { commander: 'legal' },
    card_faces: [
      {
        object: 'card_face',
        name: front,
        mana_cost: '{2}{R}',
        type_line: 'Creature — Synthetic Front',
        oracle_text: 'Synthetic front text.',
        power: '3',
        toughness: '3',
        colors: ['R'],
        image_uris: SYNTHETIC_IMAGES(`${slug(front)}-front`),
        artist: 'Synthetic Front Artist',
      },
      {
        object: 'card_face',
        name: back,
        mana_cost: '',
        type_line: 'Creature — Synthetic Back',
        oracle_text: 'Synthetic back text.',
        power: '5',
        toughness: '5',
        colors: ['R', 'G'],
        image_uris: SYNTHETIC_IMAGES(`${slug(back)}-back`),
        artist: 'Synthetic Back Artist',
      },
    ],
    ...extra,
  };
}

/** A split-style card: two faces and ONE image, at the top level. */
export function syntheticSplit(left: string, right: string): RawCard {
  const full = `${left} // ${right}`;
  return {
    object: 'card',
    id: `synthetic-id-${slug(full)}`,
    oracle_id: `synthetic-oracle-${slug(full)}`,
    name: full,
    layout: 'split',
    cmc: 4,
    color_identity: ['U', 'R'],
    legalities: { commander: 'legal' },
    image_uris: SYNTHETIC_IMAGES(slug(full)),
    artist: 'Synthetic Split Artist',
    card_faces: [
      { object: 'card_face', name: left, mana_cost: '{U}', type_line: 'Instant', colors: ['U'] },
      { object: 'card_face', name: right, mana_cost: '{R}', type_line: 'Instant', colors: ['R'] },
    ],
  };
}

export function cardNames(card: RawCard): string[] {
  const faces = (card.card_faces ?? []) as { name: string }[];
  return [String(card.name), ...faces.map((face) => face.name)].map((name) => name.toLowerCase());
}

// ---------------------------------------------------------------- a Scryfall that follows D-048

export interface ScryfallEmulation {
  /** Every card the fake Scryfall knows. */
  readonly cards: readonly RawCard[];
  /** Names `/cards/named?fuzzy=` answers with a card (lower-case query to card). */
  readonly fuzzy?: Readonly<Record<string, RawCard>>;
  /** Names `/cards/named?exact=` answers although `/cards/collection` does not know them. */
  readonly exactOnly?: Readonly<Record<string, RawCard>>;
  /** Shuffle the order of the collection answer (reverse it). */
  readonly reverse?: boolean;
  /** Names the collection answer silently leaves out, without listing them in `not_found`. */
  readonly omit?: readonly string[];
}

function frontOf(card: RawCard): string {
  const faces = (card.card_faces ?? []) as { name: string }[];
  return (faces[0]?.name ?? String(card.name)).toLowerCase();
}

/**
 * The shapes of D-048: `/cards/collection` matches single-faced cards by full name and
 * multi-faced cards only by FRONT-face name; unknown names come back in `not_found` as `{name}`.
 */
export function emulateScryfall(emulation: ScryfallEmulation): Handler {
  const notFoundBody = { object: 'error', status: 404, code: 'not_found', details: 'No match.' };
  return (call) => {
    const url = new URL(call.url);
    if (url.pathname === '/cards/collection') {
      const identifiers = (call.body as { identifiers: { name: string }[] }).identifiers;
      if (identifiers.length > 75) {
        return jsonResponse({ object: 'error', status: 400, code: 'bad_request' }, 400);
      }
      const data: RawCard[] = [];
      const notFound: { name: string }[] = [];
      for (const { name } of identifiers) {
        const query = name.toLowerCase();
        const card = emulation.cards.find((candidate) =>
          candidate.layout === 'normal'
            ? cardNames(candidate)[0] === query
            : frontOf(candidate) === query,
        );
        if (!card) notFound.push({ name });
        else if (!emulation.omit?.includes(query)) data.push(card);
      }
      if (emulation.reverse) data.reverse();
      return jsonResponse({ object: 'list', not_found: notFound, data });
    }
    if (url.pathname === '/cards/named') {
      const exact = url.searchParams.get('exact')?.toLowerCase();
      const fuzzy = url.searchParams.get('fuzzy')?.toLowerCase();
      if (exact !== undefined) {
        const card =
          emulation.exactOnly?.[exact] ??
          emulation.cards.find((candidate) => cardNames(candidate).includes(exact));
        return card ? jsonResponse(card) : jsonResponse(notFoundBody, 404);
      }
      const card = fuzzy === undefined ? undefined : emulation.fuzzy?.[fuzzy];
      return card ? jsonResponse(card) : jsonResponse(notFoundBody, 404);
    }
    return jsonResponse(notFoundBody, 404);
  };
}

export function numberedCards(count: number): RawCard[] {
  return Array.from({ length: count }, (_, index) =>
    syntheticCard(`Synthetic Card ${String(index + 1).padStart(3, '0')}`),
  );
}
