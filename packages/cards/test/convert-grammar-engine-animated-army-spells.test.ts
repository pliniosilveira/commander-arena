// Animated Army deck, the spell-properties group: Wildsear, Scouring Maw ("Enchantment spells you cast from your hand have cascade.") and Domri, Anarch of Bolas ("+1: Add {R} or {G}.
// Creature spells you cast this turn can't be countered."), read by the grammar and run by the engine. The first block parses the REAL Oracle text from the golden corpus, whole; the
// rest are SYNTHETIC cards whose abilities are the real lines (the name replaced), played through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
// Pins: CR 702.85a (Cascade triggers as the spell is cast, resolves before it; the card cast must cost less), CR 601.2a (the zone a spell is cast from), CR 604.2 and 613.1f (a static
// ability of a permanent gives an ability to a spell), CR 101.2 and 701.6a (a "can't" effect and countering), CR 611.2a (a duration of "this turn"), CR 605.1a (a loyalty ability is
// no mana ability: it uses the stack), CR 701.14 (fight).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const CASCADE_LINE = 'Enchantment spells you cast from your hand have cascade.';
const DOMRI_STATIC = 'Creatures you control get +1/+0.';
const DOMRI_PLUS = "+1: Add {R} or {G}. Creature spells you cast this turn can't be countered.";
const DOMRI_MINUS = "−2: Target creature you control fights target creature you don't control.";
const BEARS = 'Grizzly Bears';
const COUNTERSPELL = 'Counterspell';

describe('the real cards, whole', () => {
  test.each(['Wildsear, Scouring Maw', 'Domri, Anarch of Bolas'])(
    '%s is supported and valid',
    (name) => {
      const card = GOLDEN.find((c) => c.name === name);
      if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
      const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.status).toBe('supported');
      expect(validateCard(imported.definition)).toEqual([]);
    },
  );
});

const walker = (text: string): CardDefinition =>
  parsed('SYNTHETIC Reading Walker', 'Legendary Planeswalker \u2014 Domri', text, {
    manaCost: '{1}{R}{G}',
    colors: ['R', 'G'],
    loyalty: '3',
  });

describe('the grammar reads the lines', () => {
  test('"from your hand" limits the spells that have the keyword', () => {
    const [grant] = readAll(CASCADE_LINE, 'creature').abilities;
    expect(grant).toMatchObject({
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: { types: ['enchantment'], controller: 'you', castFromHand: true },
        keyword: { kind: 'cascade' },
      },
    });
  });

  test('without it the keyword is given to every spell the filter names', () => {
    const [grant] = readAll('Creature spells you cast have cascade.', 'creature').abilities;
    expect(grant).toMatchObject({
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: { types: ['creature'], controller: 'you' },
        keyword: { kind: 'cascade' },
      },
    });
  });

  test.each([
    ['another zone', CASCADE_LINE.replace('from your hand', 'from your graveyard')],
    ['another keyword', CASCADE_LINE.replace('cascade', 'flying')],
    ['spells of the opponents', CASCADE_LINE.replace('you cast', 'your opponents cast')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });

  test('"+1: Add {R} or {G}" chooses the color as the ability resolves, then the spells are named', () => {
    const lines = walker(DOMRI_PLUS).faces[0]?.abilities ?? [];
    expect(lines[0]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: 1 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'chooseOne', options: [{ label: '{R}' }, { label: '{G}' }] },
          {
            kind: 'spellsCantBeCounteredThisTurn',
            spells: { types: ['creature'], controller: 'you' },
          },
        ],
      },
    });
  });

  test.each([
    ['spells of the opponents', DOMRI_PLUS.replace('you cast', 'your opponents cast')],
    ['no duration', DOMRI_PLUS.replace(' this turn', '')],
    ['another length', DOMRI_PLUS.replace('this turn', 'until your next turn')],
  ])('%s is not read', (_what, text) => {
    const card = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Reading Walker',
        typeLine: 'Legendary Planeswalker \u2014 Domri',
        manaCost: '{1}{R}{G}',
        oracleText: text,
        loyalty: '3',
      }),
    );
    expect(card.support.unparsed.length).toBeGreaterThan(0);
  });
});

describe('Wildsear: enchantment spells cast from the hand have cascade', () => {
  const maw: CardDefinition = parsed(
    'SYNTHETIC Parsed Maw',
    'Legendary Creature — Elemental Wolf',
    `Trample\n${CASCADE_LINE}`,
    { manaCost: '{3}{R}{G}', colors: ['R', 'G'], power: '6', toughness: '6' },
  );
  const hearth: CardDefinition = parsed(
    'SYNTHETIC Parsed Hearth',
    'Enchantment',
    'Creatures you control get +1/+0.',
    { manaCost: '{2}{R}', colors: ['R'] },
  );
  const cheap: CardDefinition = parsed(
    'SYNTHETIC Parsed Ember',
    'Enchantment',
    'Creatures you control get +0/+1.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const table = (withMaw = true) => {
    const b = scenario().define(maw).define(hearth).define(cheap).seat(0);
    return (withMaw ? b.battlefield(maw.name) : b)
      .hand(hearth.name, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
      .library(cheap.name, BEARS, 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('the cards are valid', () => {
    expect(validateCard(maw)).toEqual([]);
  });

  test('an enchantment spell from the hand cascades: the trigger is above it and resolves first', () => {
    const g = table();
    g.act(0).cast(hearth.name, { pay: true });
    g.expect.stack([`${hearth.name} (ability)`, hearth.name]);
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'cascade' });
    g.act(0).accept();
    // Mana value 2 is less than 3: the cheaper enchantment is cast free and goes above the spell.
    g.expect.stack([cheap.name, hearth.name]);
  });

  test('the cascaded enchantment is cast from exile, not the hand: it does not cascade', () => {
    const g = table();
    g.act(0).cast(hearth.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(g.state.stack).toHaveLength(2);
    g.expect.stack([cheap.name, hearth.name]);
  });

  test('a creature spell does not cascade', () => {
    const g = table();
    g.act(0).cast('Grizzly Bears[0]', { pay: true });
    g.expect.stack([BEARS]);
  });

  test('without the creature on the battlefield (the permanent is gone) the spell has no cascade', () => {
    const g = table(false);
    g.act(0).cast(hearth.name, { pay: true });
    g.expect.stack([hearth.name]);
  });
});

describe("Domri: the +1 and the creature spells that can't be countered", () => {
  const domri: CardDefinition = parsed(
    'SYNTHETIC Parsed Domri',
    'Legendary Planeswalker — Domri',
    `${DOMRI_STATIC}\n${DOMRI_PLUS}\n${DOMRI_MINUS}`,
    { manaCost: '{1}{R}{G}', colors: ['R', 'G'], loyalty: '3' },
  );
  const table = () =>
    scenario()
      .define(domri)
      .seat(0)
      .battlefield(domri.name, 'Forest', 'Forest', 'Forest', 'Forest')
      .hand(BEARS, BEARS)
      .library('Island', 'Island')
      .seat(1)
      .hand(COUNTERSPELL, COUNTERSPELL)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(domri)).toEqual([]);
  });

  test('the +1 uses the stack (no mana ability), asks the color, and adds that mana', () => {
    const g = table();
    g.act(0).activate(domri.name, { ability: 1 });
    g.expect.stack([`${domri.name} (ability)`]);
    g.expect.counters(domri.name, { loyalty: 4 });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseOption', options: ['{R}', '{G}'] });
    g.act(0).chooseOption('{G}');
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['G']);
  });

  test('after it resolved, no creature spell you cast can be countered that turn, not only the one the mana pays for', () => {
    const g = table();
    g.act(0).activate(domri.name, { ability: 1 });
    g.passAll();
    g.act(0).chooseOption('{R}');
    for (let i = 0; i < 2; i += 1) {
      g.act(0).cast('Grizzly Bears[0]', { pay: true });
      g.act(0).pass();
      g.act(1).cast('Counterspell[0]', { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
      g.pass().pass(); // the Counterspell resolves and does not counter
      g.pass().pass(); // the creature spell resolves
    }
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.noEvent({ kind: 'countered' });
  });

  test('the counter spell could target it and resolved, and the creature was not countered', () => {
    const g = table();
    g.act(0).activate(domri.name, { ability: 1 });
    g.passAll();
    g.act(0).chooseOption('{R}');
    g.act(0).cast('Grizzly Bears[0]', { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell[0]', { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    g.pass().pass();
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
    g.expect.stack([BEARS]);
  });

  test('the -2 makes a creature you control fight one you do not control, with the +1/+0 of the static', () => {
    const g = scenario()
      .define(domri)
      .seat(0)
      .battlefield(domri.name, BEARS)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(domri.name, {
      ability: 2,
      targets: [
        { name: BEARS, seat: 0 },
        { name: BEARS, seat: 1 },
      ],
    });
    g.passAll();
    // Domri's static makes the 2/2 a 3/2: it kills the other Bears, and takes 2 and dies as well.
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.counters(domri.name, { loyalty: 1 });
  });
});
