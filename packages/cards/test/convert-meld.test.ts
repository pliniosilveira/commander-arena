// Meld cards in the card data (D-280, CR 701.42, 712.4, 712.5): the two halves of a pair and the combined face they become are three cards of Scryfall's data, and the
// game fetches the third with the pair. Every card here is SYNTHETIC: Scryfall's shape (the layout `meld`, one face on each half, `all_parts` naming the parts with the
// components `meld_part` and `meld_result`, the combined face a card of its own) with invented names and text. The component names are UNVERIFIED against the real
// Scryfall data (see `src/convert/meld.ts`); these tests pin what the importer does with them, and that every disagreement is a reason, never a guess.
import { validateCardStructure } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  cachedSupport,
  createScryfallClient,
  importCard,
  MemoryCardCache,
  MemorySupportCache,
  meldRelation,
  parseStoredCard,
  type ScryfallFetch,
  type StoredCard,
} from '../src/index';
import { relatedLookup } from '../src/scryfall/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import {
  createFakeClock,
  createFakeFetch,
  emulateScryfall,
  type RawCard,
  syntheticCard,
} from './scryfall-helpers';

const FRONT = 'SYNTHETIC Dusk Squire';
const BACK = 'SYNTHETIC Dawn Squire';
const RESULT = 'SYNTHETIC Twilight Titan';

const part = (name: string, component: string) => ({
  object: 'related_card',
  id: `synthetic-part-${name}`,
  component,
  name,
  type_line: 'Creature',
  uri: 'https://api.scryfall.com/cards/synthetic',
});
const PARTS = [part(FRONT, 'meld_part'), part(BACK, 'meld_part'), part(RESULT, 'meld_result')];

const MELD_TEXT = `At the beginning of your end step, if you both own and control ${FRONT} and a creature named ${BACK}, exile them, then meld them into ${RESULT}.`;

const raw = {
  front: (extra: RawCard = {}): RawCard =>
    syntheticCard(FRONT, {
      layout: 'meld',
      mana_cost: '{2}{W}',
      type_line: 'Creature — Human Knight',
      oracle_text: `Vigilance\n${MELD_TEXT}`,
      power: '2',
      toughness: '2',
      colors: ['W'],
      color_identity: ['W'],
      all_parts: PARTS,
      ...extra,
    }),
  back: (extra: RawCard = {}): RawCard =>
    syntheticCard(BACK, {
      layout: 'meld',
      mana_cost: '{1}{B}',
      type_line: 'Creature — Human Cleric',
      oracle_text: `(Melds with ${FRONT}.)`,
      power: '1',
      toughness: '3',
      colors: ['B'],
      color_identity: ['B'],
      all_parts: PARTS,
      ...extra,
    }),
  result: (extra: RawCard = {}): RawCard =>
    syntheticCard(RESULT, {
      layout: 'normal',
      mana_cost: '',
      type_line: 'Legendary Creature — Giant',
      oracle_text: 'Flying',
      power: '8',
      toughness: '8',
      colors: ['W', 'B'],
      color_identity: ['W', 'B'],
      all_parts: PARTS,
      ...extra,
    }),
};

function stored(card: RawCard): StoredCard {
  const converted = parseStoredCard(card, 0);
  if (converted.card === null) throw new Error('unreadable synthetic card');
  return converted.card;
}

const FRONT_CARD = stored(raw.front());
const BACK_CARD = stored(raw.back());
const RESULT_CARD = stored(raw.result());
const lookupOf =
  (...cards: StoredCard[]) =>
  (name: string) =>
    cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
const importWith = (card: StoredCard, ...cards: StoredCard[]) =>
  importCard(card, undefined, NO_OVERRIDES, undefined, undefined, lookupOf(...cards));

describe('what the data says (CR 712.5: the meld pairs)', () => {
  test('a half names its counterpart and the combined face', () => {
    expect(meldRelation(FRONT_CARD)).toEqual({
      role: 'half',
      partner: BACK,
      result: RESULT,
      problems: [],
    });
    expect(meldRelation(BACK_CARD)).toMatchObject({ role: 'half', partner: FRONT, result: RESULT });
  });

  test('the combined face is its own card, listed as the result of the pair', () => {
    expect(meldRelation(RESULT_CARD).role).toBe('result');
  });

  test('the combined face with the layout meld is the result whether or not its own data lists it (a face that lists only the two halves)', () => {
    const listsOnlyHalves = stored(raw.result({ layout: 'meld', all_parts: PARTS.slice(0, 2) }));
    expect(listsOnlyHalves.layout).toBe('meld');
    expect(meldRelation(listsOnlyHalves).role).toBe('result');
    expect(meldRelation(stored(raw.result({ layout: 'meld' }))).role).toBe('result');
  });

  test('a half with a mana cost whose data lists the other half but not itself is not mistaken for the combined face', () => {
    const half = stored(
      raw.front({ all_parts: [part(BACK, 'meld_part'), part(RESULT, 'meld_result')] }),
    );
    expect(meldRelation(half).role).not.toBe('result');
  });

  test('a card that is not part of a meld pair has no relation', () => {
    expect(meldRelation(stored(syntheticCard('SYNTHETIC Bear'))).role).toBe('none');
  });

  test('a meld card whose data names no counterpart or no combined face has a problem for each', () => {
    const none = stored(raw.front({ all_parts: undefined }));
    expect(meldRelation(none)).toMatchObject({ role: 'none' });
    expect(meldRelation(none).problems).toHaveLength(2);
    const noResult = stored(raw.front({ all_parts: PARTS.slice(0, 2) }));
    expect(meldRelation(noResult).problems).toEqual([
      'the card data does not name its melded face',
    ]);
  });
});

describe('a meld half with its combined face (D-280)', () => {
  test('both halves are supported when the combined face is there and fully read: the definition holds it as its second face', () => {
    const front = importWith(FRONT_CARD, RESULT_CARD);
    expect(front.support.reasons).toEqual([]);
    expect(front.support.unparsed).toEqual([]);
    expect(front.support.status).toBe('supported');
    expect(front.definition.layout).toBe('meld');
    expect(front.definition.meld).toEqual({ partner: BACK });
    expect(front.definition.faces.map((f) => f.name)).toEqual([FRONT, RESULT]);
    expect(front.definition.faces[1]?.manaCost).toBeNull();
    expect(front.definition.faces[1]?.supertypes).toEqual(['legendary']);
    const meld = front.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(meld).toMatchObject({
      interveningIf: { kind: 'ownsAndControlsNamed', name: BACK, type: 'creature' },
      effect: { kind: 'meld', partner: BACK, result: RESULT },
    });
    expect(validateCardStructure(front.definition)).toEqual([]);
    const back = importWith(BACK_CARD, RESULT_CARD);
    expect(back.support.status).toBe('supported');
    expect(back.definition.meld).toEqual({ partner: FRONT });
    // The two halves hold the same combined face (CR 712.8g).
    expect(back.definition.faces[1]).toEqual(front.definition.faces[1]);
  });

  test('with no way to find the combined face the card is unsupported and says so, as a card of the layout normal', () => {
    const card = importCard(FRONT_CARD, undefined, NO_OVERRIDES);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toEqual([
      `layout "meld": the melded face "${RESULT}" was not available, so what the two cards become is not known`,
    ]);
    expect(card.definition.layout).toBe('normal');
    expect(card.definition.faces).toHaveLength(1);
    expect(card.definition.meld).toBeUndefined();
  });

  test('a combined face that could not be fetched names why', () => {
    const card = importCard(FRONT_CARD, undefined, NO_OVERRIDES, undefined, undefined, () => ({
      error: 'HTTP 503',
    }));
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toEqual([
      `layout "meld": the melded face "${RESULT}" could not be fetched: HTTP 503`,
    ]);
  });

  test('a combined face with a line the parser does not read makes both halves unsupported, and the line is listed as face 1', () => {
    const odd = stored(
      raw.result({ oracle_text: 'Flying\nSynthetic gibberish that no rule reads.' }),
    );
    for (const half of [FRONT_CARD, BACK_CARD]) {
      const card = importWith(half, odd);
      expect(card.support.status).toBe('unsupported');
      expect(card.support.unparsed.map((u) => [u.face, u.text])).toEqual([
        [1, 'Synthetic gibberish that no rule reads.'],
      ]);
    }
  });

  test('a combined face that is not a one-faced card of that name is refused', () => {
    const wrongName = stored(raw.result({ name: 'SYNTHETIC Somebody Else' }));
    const card = importCard(
      FRONT_CARD,
      undefined,
      NO_OVERRIDES,
      undefined,
      undefined,
      () => wrongName,
    );
    expect(card.support.reasons[0]).toMatch(/is not a card of one face with that name/);
    const twoFaced = stored({
      ...raw.result(),
      card_faces: [
        { name: RESULT, mana_cost: '', type_line: 'Creature', oracle_text: '', colors: [] },
        { name: 'Other', mana_cost: '', type_line: 'Creature', oracle_text: '', colors: [] },
      ],
    });
    const two = importCard(
      FRONT_CARD,
      undefined,
      NO_OVERRIDES,
      undefined,
      undefined,
      () => twoFaced,
    );
    expect(two.support.status).toBe('unsupported');
  });

  test('the reminder text and the data must name the same counterpart', () => {
    const lying = stored(raw.back({ oracle_text: '(Melds with SYNTHETIC Somebody Else.)' }));
    const card = importWith(lying, RESULT_CARD);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toEqual([
      `layout "meld": the card text says it melds with SYNTHETIC Somebody Else, but the card data names ${FRONT}`,
    ]);
  });

  test('the meld ability and the data must name the same counterpart and combined face (the engine checks them)', () => {
    const wrongText = stored(
      raw.front({
        oracle_text: `Vigilance\nAt the beginning of your end step, if you both own and control ${FRONT} and a creature named SYNTHETIC Somebody Else, exile them, then meld them into ${RESULT}.`,
      }),
    );
    const card = importWith(wrongText, RESULT_CARD);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons.join(' ')).toMatch(/must name this card's counterpart/);
  });

  test('a meld card with no meld pair in its data is unsupported with the reasons of the data', () => {
    const lost = stored(raw.front({ all_parts: undefined }));
    const card = importWith(lost, RESULT_CARD);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toEqual([
      'layout "meld": the card data does not name the other card of its meld pair',
      'layout "meld": the card data does not name its melded face',
    ]);
  });

  test('the combined face seen alone is no card a game can hold: it exists only as the two cards put together (CR 712.4b)', () => {
    const card = importCard(RESULT_CARD, undefined, NO_OVERRIDES);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons[0]).toMatch(/combined face of a meld pair/);
  });
});

describe('the support report of a meld card is never kept (D-280)', () => {
  test('a report computed without the combined face does not poison the next import that has it', async () => {
    const cache = new MemorySupportCache();
    const first = await cachedSupport(cache, FRONT_CARD);
    expect(first.status).toBe('unsupported');
    const second = await cachedSupport(
      cache,
      FRONT_CARD,
      undefined,
      undefined,
      lookupOf(RESULT_CARD),
    );
    expect(second.status).toBe('supported');
    expect(await cache.get(FRONT_CARD.oracleId)).toBeUndefined();
  });

  test('and a kept report of another card is still read', async () => {
    const cache = new MemorySupportCache();
    const bear = stored(syntheticCard('SYNTHETIC Bear'));
    await cachedSupport(cache, bear);
    expect(await cache.get(bear.oracleId)).toBeDefined();
  });
});

describe('fetching the combined face with the pair (D-280)', () => {
  const setup = (cards: RawCard[]) => {
    const clock = createFakeClock();
    const http = createFakeFetch(clock, emulateScryfall({ cards }));
    const cache = new MemoryCardCache({ now: clock.now });
    const client = createScryfallClient({
      fetch: http.fetch as ScryfallFetch,
      now: clock.now,
      sleep: clock.sleep,
      cache,
    });
    return { clock, http, client };
  };

  test('a deck with a meld card costs one more request, for the combined face, and the lookup gives it', async () => {
    const { clock, http, client } = setup([raw.front(), raw.back(), raw.result()]);
    const resolved = await clock.run(client.resolveNames([FRONT, 'Grizzly Bears']));
    expect([...resolved.found.keys()]).toEqual([FRONT.toLowerCase()]);
    expect(resolved.notFound).toEqual(['Grizzly Bears']);
    const asked = http.calls
      .filter((c) => c.method === 'POST')
      .map((c) => (c.body as { identifiers: { name: string }[] }).identifiers.map((i) => i.name));
    expect(asked).toEqual([[FRONT, 'Grizzly Bears'], [RESULT]]);
    const related = relatedLookup(resolved.related)(RESULT);
    expect(related).toMatchObject({ name: RESULT });
    const card = resolved.found.get(FRONT.toLowerCase());
    expect(
      card &&
        importCard(
          card,
          undefined,
          NO_OVERRIDES,
          undefined,
          undefined,
          relatedLookup(resolved.related),
        ).support.status,
    ).toBe('supported');
  });

  test('the combined face comes from the cache the next time: no request for it', async () => {
    const { clock, http, client } = setup([raw.front(), raw.back(), raw.result()]);
    await clock.run(client.resolveNames([FRONT]));
    const before = http.calls.length;
    const again = await clock.run(client.resolveNames([FRONT]));
    expect(http.calls.length).toBe(before);
    expect(relatedLookup(again.related)(RESULT)).toMatchObject({ name: RESULT });
  });

  test('a deck with no meld card asks for nothing more and has no related cards', async () => {
    const { clock, http, client } = setup([syntheticCard('SYNTHETIC Bear')]);
    const resolved = await clock.run(client.resolveNames(['SYNTHETIC Bear']));
    expect(resolved.related).toBeUndefined();
    expect(http.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  test('a combined face Scryfall does not know is reported with the reason, and the meld card is unsupported', async () => {
    const { clock, client } = setup([raw.front(), raw.back()]);
    const resolved = await clock.run(client.resolveNames([FRONT]));
    expect(relatedLookup(resolved.related)(RESULT)).toEqual({
      error: 'no card of that name was found',
    });
    const card = resolved.found.get(FRONT.toLowerCase());
    const imported =
      card &&
      importCard(
        card,
        undefined,
        NO_OVERRIDES,
        undefined,
        undefined,
        relatedLookup(resolved.related),
      );
    expect(imported?.support.status).toBe('unsupported');
    expect(imported?.support.reasons[0]).toMatch(
      /could not be fetched: no card of that name was found/,
    );
  });

  test('a failure to reach Scryfall for the combined face names the failure', async () => {
    const clock = createFakeClock();
    const base = emulateScryfall({ cards: [raw.front(), raw.back(), raw.result()] });
    const http = createFakeFetch(clock, (call, index) =>
      index >= 1 ? new Response('', { status: 503 }) : base(call, index),
    );
    const client = createScryfallClient({
      fetch: http.fetch as ScryfallFetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    const resolved = await clock.run(client.resolveNames([FRONT]));
    const hit = relatedLookup(resolved.related)(RESULT);
    expect(hit).toMatchObject({ error: expect.stringContaining('503') });
  });
});
