// Embalm (CR 702.128) and "You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, the token has no mana cost, it's
// white, and it's a Zombie in addition to its other types" (Angel of Sanctions, Vizier of Many Faces; issue 104).
// Pins: CR 702.128a (the cost, the exile of the card from the graveyard as a cost, a token copy that is white with no mana cost and a Zombie in addition, sorcery speed),
// CR 702.128b (a token is embalmed when a resolving embalm ability created it), CR 707.9b (what the exception sets is part of the copiable values), CR 614.12 and 707.2 (it enters as
// a copy), CR 111.4 (a token). Cards are SYNTHETIC (src/cards/fixtures/synthetic-embalm.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const SERAPH = 'SYNTHETIC Embalmed Seraph'; // {3}{W}{W} 3/4 Angel, flying, Embalm {5}{W}
const SCRIBE = 'SYNTHETIC Embalmed Scribe'; // {1}{U} 2/1 Human Wizard, Embalm {1}{U}
const FACES = 'SYNTHETIC Many Faces'; // {2}{U}{U} 0/0, may enter as a copy of a creature, Embalm {1}{U}
const BEARS = 'Grizzly Bears'; // {1}{G} Bear 2/2
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const start = (
  card: string,
  lands: readonly string[],
  extra: readonly string[] = [],
  zone: 'graveyard' | 'hand' = 'graveyard',
): ScenarioGame => {
  const b = scenario().seat(0);
  (zone === 'graveyard' ? b.graveyard(card) : b.hand(card))
    .battlefield(...lands, ...extra)
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain');
  return b.build();
};

const bf = (name: string) => ({ name, zone: 'battlefield', seat: 0 }) as const;
const shown = (g: ScenarioGame, name: string) =>
  getView(g.state, 0).battlefield.filter((o) => o.name === name);

describe('the cards are valid', () => {
  test.each([SERAPH, SCRIBE, FACES])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('Embalm is a supported keyword', () => {
    expect(isFeatureSupported('keyword:embalm')).toBe(true);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(SCRIBE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withKeyword = (keyword: Record<string, unknown>, types = face.types) =>
      ({
        ...card,
        faces: [{ ...face, types, abilities: [{ kind: 'keyword', keyword }] }],
      }) as never;
    const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }];
    expect(validateCard(withKeyword({ kind: 'embalm', cost: mana('1', 'U') }))).toEqual([]);
    expect(
      validateCard(withKeyword({ kind: 'embalm', cost: mana('X', 'U') })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withKeyword({ kind: 'embalm', cost: [{ kind: 'payLife', amount: 2 }] })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withKeyword({ kind: 'embalm', cost: mana('1', 'U') }, ['instant'])).length,
    ).toBeGreaterThan(0);
    const two = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            { kind: 'keyword', keyword: { kind: 'embalm', cost: mana('1') } },
            { kind: 'keyword', keyword: { kind: 'embalm', cost: mana('2') } },
          ],
        },
      ],
    } as never;
    expect(validateCard(two).length).toBeGreaterThan(0);
  });

  test('the exceptions of ifEmbalmed are checked', () => {
    const card = syntheticCard(FACES);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withExcept = (ifEmbalmed: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'replacement',
                replacement: {
                  kind: 'entersAsCopy',
                  what: { types: ['creature'] },
                  duration: 'permanent',
                  ifEmbalmed,
                },
              },
            ],
          },
        ],
      }) as never;
    expect(validateCard(withExcept({ setColors: ['W'], noManaCost: true }))).toEqual([]);
    expect(validateCard(withExcept({ setColors: ['X'] })).length).toBeGreaterThan(0);
    expect(validateCard(withExcept({ noManaCost: false })).length).toBeGreaterThan(0);
    expect(validateCard(withExcept({ addSubtypes: [] })).length).toBeGreaterThan(0);
    expect(validateCard(withExcept({ addSubtypes: ['Aura'] })).length).toBeGreaterThan(0);
  });
});

describe("Embalm {1}{U}: \"[Cost], Exile this card from your graveyard: Create a token that's a copy of it, except it's white, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery.\" (CR 702.128a)", () => {
  test('the option is there from the graveyard with the mana, and only then', () => {
    start(SCRIBE, ['Island', 'Island']).expect.legal(0, { activate: SCRIBE });
    start(SCRIBE, ['Island']).expect.illegal(0, { activate: SCRIBE });
    start(SCRIBE, ['Island', 'Island'], [], 'hand').expect.illegal(0, { activate: SCRIBE });
  });

  test('sorcery speed only: not in combat', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SCRIBE)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('beginningOfCombat')
      .build();
    g.expect.illegal(0, { activate: SCRIBE });
  });

  test('the card is exiled as the cost; the token is a white copy with no mana cost and the Zombie type besides its own', () => {
    const g = start(SCRIBE, ['Island', 'Island']);
    g.act(0).activate(SCRIBE, { pay: true });
    g.expect.zone(SCRIBE, 'exile', { seat: 0 });
    g.expect.noObject(SCRIBE, { zone: 'graveyard' });
    g.passAll();
    const token = g.find({ name: SCRIBE, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    expect(token[0]?.token).not.toBeNull();
    // It is not 4/4 (that is Eternalize): the printed 2/1.
    g.expect.pt(bf(SCRIBE), 2, 1);
    g.expect.derived(bf(SCRIBE), {
      types: ['creature'],
      subtypes: ['Human', 'Wizard', 'Zombie'],
      colors: ['W'],
    });
    expect(shown(g, SCRIBE)[0]?.manaCost).toBeNull();
    g.expect.invariants();
  });

  test('a card of another color has only the color white (flying and the rest are copied)', () => {
    const g = start(SERAPH, ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).activate(SERAPH, { pay: true });
    g.passAll();
    g.expect.derived(bf(SERAPH), {
      subtypes: ['Angel', 'Zombie'],
      colors: ['W'],
      keywords: ['flying', 'embalm'],
    });
    g.expect.pt(bf(SERAPH), 3, 4);
  });

  test('the token stays after it has been made, and the card is gone from the graveyard (it cannot be embalmed twice)', () => {
    const g = start(SCRIBE, ['Island', 'Island', 'Island', 'Island']);
    g.act(0).activate(SCRIBE, { pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: SCRIBE });
  });
});

describe('"You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, ..." (CR 707.9b, 702.128b)', () => {
  const cast = (g: ScenarioGame) => {
    g.act(0).cast(FACES, { pay: true });
    g.passAll();
  };

  test('cast from the hand, it is the copy and nothing else changes: a green Bear with its mana cost', () => {
    const g = start(FACES, ['Island', 'Island', 'Island', 'Island'], [BEARS], 'hand');
    cast(g);
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    g.act(0).choosePermanents(BEARS);
    g.expect.pt(`${FACES}`, 2, 2);
    // `${BEARS}[1]` is the copy of the Bear: the name is the Bear's.
    const copy = g
      .find({ name: BEARS, zone: 'battlefield', seat: 0 })
      .filter((o) => o.token === null);
    expect(copy).toHaveLength(2);
    g.expect.derived(`${BEARS}[1]`, { subtypes: ['Bear'], colors: ['G'] });
    expect(shown(g, BEARS).every((o) => o.manaCost !== null)).toBe(true);
  });

  test('embalmed, it enters as a copy of the creature chosen, white, a Zombie in addition and with no mana cost', () => {
    const g = start(FACES, ['Island', 'Island'], [BEARS]);
    g.act(0).activate(FACES, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    g.act(0).choosePermanents(BEARS);
    const bears = g.find({ name: BEARS, zone: 'battlefield', seat: 0 });
    expect(bears).toHaveLength(2);
    g.expect.derived(`${BEARS}[0]`, { subtypes: ['Bear'], colors: ['G'] });
    g.expect.derived(`${BEARS}[1]`, { subtypes: ['Bear', 'Zombie'], colors: ['W'] });
    g.expect.pt(`${BEARS}[1]`, 2, 2);
    const mana = shown(g, BEARS).map((o) => o.manaCost);
    expect(mana.filter((m) => m === null)).toHaveLength(1);
    expect(
      g.find({ name: BEARS, zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null),
    ).toHaveLength(1);
    g.expect.invariants();
  });

  test('the exceptions are part of the copiable values: a copy of the embalmed copy has them', () => {
    const g = start(FACES, ['Island', 'Island'], [BEARS]);
    g.act(0).activate(FACES, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    const token = g
      .find({ name: BEARS, zone: 'battlefield', seat: 0 })
      .find((o) => o.token !== null);
    expect(token).toBeDefined();
    // (the copiable values of the token are read by `copiableValues`; the derived characteristics are the ones the exceptions gave)
    g.expect.derived(`${BEARS}[1]`, { colors: ['W'], subtypes: ['Bear', 'Zombie'] });
  });

  test('declining leaves the token the 0/0 it is: white Zombie with no mana cost, and it dies', () => {
    const g = start(FACES, ['Island', 'Island'], [BEARS]);
    g.act(0).activate(FACES, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.noObject(FACES, { zone: 'battlefield' });
  });

  test('with no creature on the battlefield there is no question, and the token is the 0/0 white Zombie', () => {
    const g = start(FACES, ['Island', 'Island']);
    g.act(0).activate(FACES, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });

  test('the creature of an opponent can be copied by the embalmed token', () => {
    const g = scenario()
      .seat(0)
      .graveyard(FACES)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    g.act(0).activate(FACES, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.derived({ name: BEARS, zone: 'battlefield', seat: 0 }, { colors: ['W'] });
    g.expect.pt({ name: BEARS, zone: 'battlefield', seat: 0 }, 2, 2);
  });
});
