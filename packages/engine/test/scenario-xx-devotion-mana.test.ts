// "{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color." (the mana production `anyColorDevotion`).
// Pins: CR 605.1a and 605.3b (a mana ability does not use the stack and resolves immediately after it is activated: the color is taken with the activation and the mana is added at once), CR 700.5 (devotion:
// the mana symbols of a color among the mana costs of the permanents a player controls, hybrid symbols counted for each of their colors), CR 118.3 and 605.3a
// (the {2} comes out of the pool), CR 601.2g (the payment planner knows what the ability can make).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-devotion-mana.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SHRINE = 'SYNTHETIC Devotion Shrine';
const FREE = 'SYNTHETIC Free Devotion Shrine';
const TRIPLE = 'SYNTHETIC Green Triple'; // {G}{G}{G}
const GREEN = 'SYNTHETIC Green Single'; // {2}{G}
const WHITE = 'SYNTHETIC White Single'; // {1}{W}
const HYBRID = 'SYNTHETIC Hybrid Pair'; // {G/W}{G/W}
const PHYREXIAN = 'SYNTHETIC Phyrexian Dabbler'; // {1}{B/P}
const BLACK = 'SYNTHETIC Black Triple'; // {B}{B}{B}
const FODDER = 'SYNTHETIC Black Fodder'; // {B}{B}{B}, "Sacrifice this creature: Add {C}{C}."
const ROCK = 'SYNTHETIC Colorless Fodder'; // no mana cost, "Sacrifice this artifact: Add {C}{C}."
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([SHRINE, FREE, TRIPLE, GREEN, WHITE, HYBRID, PHYREXIAN, BLACK, FODDER, ROCK])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );

  test('a spell or a triggered ability cannot add it: only a mana ability can ask the color', () => {
    const card = syntheticCard(TRIPLE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const spell = {
      ...card,
      faces: [
        {
          ...face,
          types: ['sorcery'],
          power: undefined,
          toughness: undefined,
          spell: { effect: { kind: 'addMana', mana: { kind: 'anyColorDevotion' } } },
        },
      ],
    };
    expect(JSON.stringify(validateCard(spell as never))).toContain('anyColorDevotion');
  });
});

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('the amount is the controller’s devotion to the chosen color (CR 700.5)', () => {
  test('devotion 3 to green from one permanent: {G}{G}{G}, and the other colors are not on offer', () => {
    const g = game((b) => b.battlefield(FREE, TRIPLE));
    g.expect.legal(0, { tap: FREE, color: 'G' });
    for (const color of ['W', 'U', 'B', 'R', 'C'] as const) {
      g.expect.illegal(0, { tap: FREE, color });
    }
    g.act(0).tapForMana(FREE, { color: 'G' });
    g.expect.pool(0, 'GGG');
    g.expect.tapped(FREE);
    g.expect.stack([]); // a mana ability: it never used the stack
  });

  test('the symbols of several permanents add up: {2}{G} and {1}{W} and {G}{G}{G} make devotion 4 to green and 1 to white', () => {
    const g = game((b) => b.battlefield(FREE, TRIPLE, GREEN, WHITE));
    g.act(0).tapForMana(FREE, { color: 'G' });
    g.expect.pool(0, 'GGGG');
    const h = game((b) => b.battlefield(FREE, TRIPLE, GREEN, WHITE));
    h.act(0).tapForMana(FREE, { color: 'W' });
    h.expect.pool(0, 'W');
  });

  test('a hybrid symbol counts for each of its colors: {G/W}{G/W} is devotion 2 to green and 2 to white', () => {
    const g = game((b) => b.battlefield(FREE, HYBRID));
    g.act(0).tapForMana(FREE, { color: 'G' });
    g.expect.pool(0, 'GG');
    const h = game((b) => b.battlefield(FREE, HYBRID));
    h.act(0).tapForMana(FREE, { color: 'W' });
    h.expect.pool(0, 'WW');
  });

  test('a Phyrexian symbol counts for its color and a generic symbol for none', () => {
    const g = game((b) => b.battlefield(FREE, PHYREXIAN));
    g.act(0).tapForMana(FREE, { color: 'B' });
    g.expect.pool(0, 'B');
    g.expect.illegal(0, { tap: FREE, color: 'G' });
  });

  test('devotion 0: nothing is on offer and the ability cannot be activated', () => {
    const g = game((b) => b.battlefield(FREE));
    expect(g.legalActions(0).some((a) => a.kind === 'activateAbility')).toBe(false);
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      expect(g.act(0).try.tapForMana(FREE, { color }).ok).toBe(false);
    }
    g.expect.tapped(FREE, false);
    g.expect.pool(0, '');
  });

  test('only the controller’s permanents count, not the opponent’s (CR 700.5)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FREE, WHITE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(TRIPLE)
      .build();
    g.expect.illegal(0, { tap: FREE, color: 'G' });
    g.act(0).tapForMana(FREE, { color: 'W' });
    g.expect.pool(0, 'W');
  });

  test('the devotion is what the permanents are now: without the green permanent there is none to green', () => {
    const g = game((b) => b.battlefield(FREE, TRIPLE, WHITE));
    g.expect.legal(0, { tap: FREE, color: 'G' });
    const h = game((b) => b.battlefield(FREE, WHITE));
    h.expect.illegal(0, { tap: FREE, color: 'G' });
  });

  test('a permanent that is a land with no mana cost adds none (CR 700.5: only symbols of mana costs)', () => {
    const g = game((b) => b.battlefield(FREE, 'Forest', 'Forest', TRIPLE));
    g.act(0).tapForMana(FREE, { color: 'G' });
    g.expect.pool(0, 'GGG');
  });
});

describe('the {2} of the ability is paid from the pool (CR 605.3a, 118.3)', () => {
  test('with two mana in the pool it taps and adds the mana; the cost mana is gone', () => {
    const g = game((b) => b.battlefield(SHRINE, TRIPLE).pool('WW'));
    g.act(0).tapForMana(SHRINE, { ability: 1, color: 'G' });
    g.expect.pool(0, 'GGG');
    g.expect.tapped(SHRINE);
  });

  test('with an empty pool it cannot be activated by hand and says what it costs', () => {
    const g = game((b) => b.battlefield(SHRINE, TRIPLE));
    const r = g.act(0).try.tapForMana(SHRINE, { ability: 1, color: 'G' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('costs {2}');
    g.expect.pool(0, '');
  });

  test('the first ability still adds {C}', () => {
    const g = game((b) => b.battlefield(SHRINE, TRIPLE));
    g.act(0).tapForMana(SHRINE);
    g.expect.pool(0, 'C');
  });
});

describe('paying for a spell with it (CR 601.2g)', () => {
  test('{G}{G}{G} is paid by the shrine, whose {2} the two Plains pay, with devotion 3 to green', () => {
    const g = game((b) => b.hand(TRIPLE).battlefield(SHRINE, 'Plains', 'Plains', TRIPLE));
    g.expect.legal(0, { cast: TRIPLE });
    g.act(0).cast(TRIPLE, { pay: true });
    g.passAll();
    g.expect.tapped(SHRINE);
    g.expect.zone(TRIPLE, 'battlefield', { seat: 0 });
  });

  test('devotion 1 to green is not enough for {G}{G}{G}', () => {
    const g = game((b) => b.hand(TRIPLE).battlefield(SHRINE, 'Plains', 'Plains', GREEN));
    g.expect.illegal(0, { cast: TRIPLE });
  });

  test('with no devotion the ability is no source of colored mana', () => {
    const g = game((b) => b.hand(TRIPLE).battlefield(SHRINE, 'Plains', 'Plains'));
    g.expect.illegal(0, { cast: TRIPLE });
  });
});

describe('what the plan itself sacrifices does not count (CR 605.3a, 605.3b, 700.5, 601.2g)', () => {
  test('the {2} paid by sacrificing the only permanent with {B}{B}{B}: devotion is 0, so {B}{B}{B} is not on offer', () => {
    const g = game((b) => b.hand(BLACK).battlefield(SHRINE, FODDER));
    g.expect.illegal(0, { cast: BLACK });
    expect(g.act(0).try.cast(BLACK).ok).toBe(false);
    g.expect.zone(FODDER, 'battlefield', { seat: 0 });
    g.expect.tapped(SHRINE, false);
  });

  test('a plan that sacrifices a permanent with devotion is refused even when other devotion remains (honest: no guess at the order)', () => {
    const g = game((b) => b.hand(BLACK).battlefield(SHRINE, FODDER, BLACK));
    g.expect.illegal(0, { cast: BLACK });
  });

  test('a sacrificed permanent without mana cost counts for nothing: the {2} is paid with it and the devotion of the rest pays', () => {
    const g = game((b) => b.hand(BLACK).battlefield(SHRINE, ROCK, BLACK));
    g.expect.legal(0, { cast: BLACK });
    g.act(0).cast(BLACK, { pay: true });
    g.passAll();
    g.expect.zone(ROCK, 'graveyard', { seat: 0 });
    g.expect.tapped(SHRINE);
    g.expect.pool(0, '');
  });

  test('with Plains for the {2} the sacrificer stays and its symbols count, as before', () => {
    const g = game((b) => b.hand(BLACK).battlefield(SHRINE, FODDER, 'Plains', 'Plains'));
    g.expect.legal(0, { cast: BLACK });
    g.act(0).cast(BLACK, { pay: true });
    g.passAll();
    g.expect.zone(FODDER, 'battlefield', { seat: 0 });
    g.expect.tapped(SHRINE);
  });
});
