// The Bruna deck (issue 5), meld (D-277 to D-282): Bruna, the Fading Light and Gisela, the Broken Blade, the REAL cards of the golden corpus, read through the grammar only and played
// through applyAction, with the melded face the game would fetch: Brisela, Voice of Nightmares, whose Oracle text is the one the owner copied from Scryfall ("Flying, first strike,
// vigilance, lifelink / Your opponents can't cast spells with mana value 3 or less. / 9/10"). The golden corpus holds neither the `all_parts` of the two cards nor Brisela's card, so
// this test adds both: the parts as the UNVERIFIED components `meld_part` and `meld_result` (`src/convert/meld.ts`) and Brisela with the text above (its ids and colors are not
// known here, and nothing in this test reads them).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  fromGoldenCard,
  type GoldenCard,
  importCard,
  parseGolden,
  type StoredCard,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const corpus: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const BRUNA = 'Bruna, the Fading Light';
const GISELA = 'Gisela, the Broken Blade';
const BRISELA = 'Brisela, Voice of Nightmares';

const PARTS = [
  { name: BRUNA, component: 'meld_part' },
  { name: GISELA, component: 'meld_part' },
  { name: BRISELA, component: 'meld_result' },
];

function realCard(name: string): StoredCard {
  const card = corpus.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { ...fromGoldenCard({ ...card, relatedParts: PARTS }) };
}

/** Brisela as a stored card: the owner's text; ids, colors and the clock are placeholders that nothing reads. */
const BRISELA_CARD: StoredCard = {
  oracleId: 'placeholder-not-the-real-oracle-id',
  scryfallId: 'placeholder',
  name: BRISELA,
  layout: 'normal',
  faces: [
    {
      name: BRISELA,
      manaCost: '',
      typeLine: 'Legendary Creature — Eldrazi Angel',
      oracleText:
        "Flying, first strike, vigilance, lifelink\nYour opponents can't cast spells with mana value 3 or less.",
      power: '9',
      toughness: '10',
      loyalty: null,
      defense: null,
      colors: [],
      imageUris: null,
      artist: null,
    },
  ],
  cmc: 0,
  colorIdentity: ['W'],
  keywords: [],
  producedMana: [],
  commanderLegality: 'not_legal',
  edhrecRank: null,
  gameChanger: null,
  relatedParts: PARTS,
  fetchedAt: 0,
};

const lookup = (name: string) => (name === BRISELA ? BRISELA_CARD : undefined);

function pair(): { bruna: CardDefinition; gisela: CardDefinition } {
  const bruna = importCard(realCard(BRUNA), undefined, NO_OVERRIDES, undefined, undefined, lookup);
  const gisela = importCard(
    realCard(GISELA),
    undefined,
    NO_OVERRIDES,
    undefined,
    undefined,
    lookup,
  );
  return { bruna: bruna.definition, gisela: gisela.definition };
}

describe('what the grammar reads of the real cards', () => {
  const bruna = importCard(realCard(BRUNA), undefined, NO_OVERRIDES, undefined, undefined, lookup);
  const gisela = importCard(
    realCard(GISELA),
    undefined,
    NO_OVERRIDES,
    undefined,
    undefined,
    lookup,
  );

  test('Brisela is read in full: four keywords and the cast restriction, a 9/10 with no mana cost', () => {
    const face = gisela.definition.faces[1];
    expect(face?.name).toBe(BRISELA);
    expect(face?.manaCost).toBeNull();
    expect([face?.power, face?.toughness]).toEqual([9, 10]);
    expect(face?.supertypes).toEqual(['legendary']);
    expect(face?.subtypes).toEqual(['Eldrazi', 'Angel']);
    expect(face?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      { kind: 'keyword', keyword: { kind: 'lifelink' } },
      {
        kind: 'static',
        static: {
          kind: 'opponentsCantCastSpells',
          spells: { manaValue: { cmp: 'atMost', value: 3 } },
        },
      },
    ]);
  });

  test('both halves are supported with the data the test gives, and hold the same combined face', () => {
    expect(gisela.support.reasons).toEqual([]);
    expect(gisela.support.unparsed).toEqual([]);
    expect(gisela.support.status).toBe('supported');
    expect(bruna.support.reasons).toEqual([]);
    expect(bruna.support.unparsed).toEqual([]);
    expect(bruna.support.status).toBe('supported');
    expect(bruna.definition.faces[1]).toEqual(gisela.definition.faces[1]);
    expect(gisela.definition.meld).toEqual({ partner: BRUNA });
    expect(bruna.definition.meld).toEqual({ partner: GISELA });
  });

  test("Gisela's ability is the meld ability, naming Bruna and Brisela as the text says", () => {
    expect(gisela.definition.faces[0]?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      { kind: 'keyword', keyword: { kind: 'lifelink' } },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'ownsAndControlsNamed', name: BRUNA, type: 'creature' },
        effect: { kind: 'meld', partner: BRUNA, result: BRISELA },
      },
    ]);
  });

  test("Bruna's cast trigger returns an Angel or Human creature card from the graveyard", () => {
    expect(bruna.definition.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: expect.objectContaining({ kind: 'castSpell', self: true }),
        optional: true,
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                types: ['creature'],
                controller: 'you',
                anyOf: [{ subtypes: ['Angel'] }, { subtypes: ['Human'] }],
              },
            },
          },
        ],
        effect: expect.objectContaining({ kind: 'moveToZone', to: 'battlefield' }),
      }),
    );
  });

  test('without the melded face the two cards are unsupported and say so; the corpus alone has no relation', () => {
    const alone = importCard(realCard(GISELA), undefined, NO_OVERRIDES);
    expect(alone.support.status).toBe('unsupported');
    expect(alone.support.reasons[0]).toMatch(/layout "meld": the melded face .* was not available/);
    const noParts = importCard(fromGoldenCard(corpus.find((c) => c.name === GISELA) as GoldenCard));
    expect(noParts.support.reasons).toContain(
      'layout "meld": the card data does not name the other card of its meld pair',
    );
  });
});

describe('played through the engine', () => {
  const { bruna, gisela } = pair();

  const board = (extra: { commander?: boolean } = {}) =>
    scenario()
      .define(bruna)
      .define(gisela)
      .seat(0)
      .battlefield(GISELA, { label: 'gisela' })
      .battlefield(BRUNA, {
        label: 'bruna',
        ...(extra.commander === true ? { commander: true } : {}),
      })
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .seat(1)
      .library(...Array.from({ length: 12 }, () => 'Plains'));

  test('at the beginning of the end step both are exiled and meld into Brisela: a 9/10 with the four keywords and mana value 11 (CR 202.3c)', () => {
    const g = board().build();
    g.advanceTo('end');
    g.passAll();
    const view = g.view(0).battlefield.find((o) => o.name === BRISELA);
    expect(view).toBeDefined();
    expect(g.object('gisela')).toBe(g.object('bruna'));
    expect(view?.power).toBe(9);
    expect(view?.toughness).toBe(10);
    expect(view?.keywords).toEqual(['flying', 'firstStrike', 'vigilance', 'lifelink']);
    // {5}{W}{W} and {2}{W}{W}: 7 and 4.
    expect(view?.meld?.manaValue).toBe(11);
    expect(view?.meld?.components.map((c) => c.name)).toEqual([GISELA, BRUNA]);
  });

  test('the commander is Bruna: the melded permanent is her player commander (CR 903.3b)', () => {
    const g = board({ commander: true }).build();
    g.advanceTo('end');
    g.passAll();
    const view = g.view(0).battlefield.find((o) => o.name === BRISELA);
    expect(view?.isCommander).toBe(true);
    expect(view?.meld?.components.map((c) => c.name)).toEqual([BRUNA, GISELA]);
  });

  test('Brisela stops the opponent: no spell with mana value 3 or less, a bigger one is fine (CR 101.2)', () => {
    const g = scenario()
      .define(bruna)
      .define(gisela)
      .seat(0)
      .battlefield(GISELA)
      .battlefield(BRUNA)
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .seat(1)
      .hand('Lightning Bolt', 'Serra Angel')
      .battlefield('Mountain', 'Plains', 'Plains', 'Plains', 'Plains')
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .build();
    g.advanceTo('end');
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.expect.illegal(1, { cast: 'Lightning Bolt' });
    g.expect.legal(1, { cast: 'Serra Angel' });
  });

  test("Bruna's cast trigger: an Angel or a Human card of the graveyard may return, a Bear card may not (CR 205.3m)", () => {
    const g = scenario()
      .define(bruna)
      .seat(0)
      .hand(BRUNA)
      .battlefield('Plains', { count: 7 })
      .graveyard('Serra Angel', 'Grizzly Bears', 'Youthful Knight')
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .seat(1)
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .build();
    g.act(0).cast(BRUNA, { pay: true });
    // The trigger asks for its target among the legal ones: the Angel and the Human Knight, not the Bear.
    const asked = g.state.pending;
    expect(asked?.kind).toBe('targets');
    // Two cards qualify, the Angel and the Human Knight; the Bear is not a legal target.
    expect(asked?.kind === 'targets' ? asked.specs[0]?.legal.length : 0).toBe(2);
    expect(() => g.act(0).chooseTargets('Grizzly Bears')).toThrow();
    g.act(0).chooseTargets('Serra Angel');
    g.passAll();
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield');
    g.expect.zone('Grizzly Bears', 'graveyard');
  });
});
