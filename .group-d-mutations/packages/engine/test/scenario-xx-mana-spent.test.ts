// "The amount of mana spent to cast it" and "for each mana from an artifact source spent to cast it" (D-183, the Korvold slice 5).
// Pins: CR 601.2h (the total cost is paid with mana; what was spent is a fact about the spell), CR 601.2i (a spell becomes cast and the abilities that
// trigger on it do), CR 113.7a (last-known information of a spell that left the stack), CR 614.12 and 122.6 (a permanent that enters with counters),
// CR 106.1 (mana), CR 605.3a (the mana that pays for a mana ability is not spent on the spell), CR 707.10 (a copy is not cast), CR 702.51a (Convoke
// taps creatures, it is not mana). Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-spent.ts) with the wording of the real cards.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { checkInvariants, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DRAGON = 'SYNTHETIC Kobold Dragon'; // {3}{B}{R}{G}, 5/5 flying; the trigger makes X 0/1 Kobolds, X the mana spent
const KOBOLD = 'Kobolds of Kher Keep';
const COIN = 'SYNTHETIC Coin Press'; // creatures enter with +1/+1 for each mana from an artifact source spent; {T}: create a Treasure
const PRESS = 'SYNTHETIC Mana Press'; // creatures enter with +1/+1 for each mana spent to cast them
const BEARS = 'Grizzly Bears'; // {1}{G}
const SPIDER = 'Giant Spider'; // {3}{G}
const SOL_RING = 'Sol Ring'; // {T}: Add {C}{C}
const COUNTER = 'Counterspell'; // {U}{U}
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([DRAGON, COIN, PRESS])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const kobolds = (g: ScenarioGame): number =>
  g.find({ name: KOBOLD, zone: 'battlefield', seat: 0 }).length;

const dragonGame = (
  lands: readonly string[],
  more: (b: ReturnType<typeof scenario>) => void = () => undefined,
) => {
  const b = scenario()
    .seat(0)
    .hand(DRAGON)
    .battlefield(...lands)
    .library(...LIBRARY);
  more(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .build();
};

describe('"When you cast this spell, create X ... tokens, where X is the amount of mana spent to cast it"', () => {
  const SIX = ['Swamp', 'Mountain', 'Forest', 'Plains', 'Plains', 'Plains'];

  test('six mana spent: the trigger goes on the stack above the spell and makes six Kobolds', () => {
    const g = dragonGame(SIX);
    g.act(0).cast(DRAGON, { pay: true });
    g.expect.stack([`${DRAGON} (ability)`, DRAGON]); // its trigger above the spell
    g.passAll();
    expect(kobolds(g)).toBe(6);
    g.expect.zone(DRAGON, 'battlefield', { seat: 0 });
    // The tokens are what the card says: 0/1 red Kobold creatures named Kobolds of Kher Keep.
    const token = g.find({ name: KOBOLD, zone: 'battlefield' })[0];
    expect(token?.token?.characteristics).toMatchObject({
      name: KOBOLD,
      power: 0,
      toughness: 1,
      colors: ['R'],
      subtypes: ['Kobold'],
    });
    g.expect.invariants();
  });

  test('only the mana spent counts: unused sources and unspent pool mana are not', () => {
    const g = dragonGame([...SIX, 'Plains', 'Plains']);
    g.act(0).tapForMana('Plains[0]'); // two Plains tapped by hand: the pool holds WW
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    // The cost is six mana. Whatever paid it, two mana more were not spent on it.
    expect(kobolds(g)).toBe(6);
  });

  test('paid by hand from the pool: the mana tapped earlier counts as it is spent', () => {
    const g = dragonGame(SIX);
    g.act(0)
      .cast(DRAGON)
      .payManual(['Swamp', 'Mountain', 'Forest', 'Plains[0]', 'Plains[1]', 'Plains[2]']);
    g.passAll();
    expect(kobolds(g)).toBe(6);
  });

  test('a Treasure sacrificed for the mana counts as mana spent', () => {
    const g = dragonGame(['Swamp', 'Mountain', 'Forest', 'Plains', 'Plains'], (b) =>
      b.battlefield(COIN),
    );
    g.act(0).activate(COIN);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    g.act(0)
      .cast(DRAGON)
      .payManual([
        'Swamp',
        'Mountain',
        'Forest',
        'Plains[0]',
        'Plains[1]',
        { source: 'Treasure', color: 'W' },
      ]);
    g.passAll();
    expect(kobolds(g)).toBe(6);
    g.expect.noObject('Treasure');
  });

  test('commander tax is mana spent: cast from the command zone with {2} more, eight Kobolds', () => {
    const g = scenario()
      .seat(0)
      .command(DRAGON, { commander: true, casts: 1 })
      .battlefield(...SIX, 'Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    expect(kobolds(g)).toBe(8);
  });

  test('a cost reduction is not mana spent: the spell costs {2} less, four mana are spent, four Kobolds', () => {
    // "Creature spells you cast with power 4 or greater cost {2} less to cast." (SYNTHETIC Titan Tamer)
    const g = dragonGame(SIX.slice(0, 4), (b) => b.battlefield('SYNTHETIC Titan Tamer'));
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    expect(kobolds(g)).toBe(4);
  });

  test('last-known information: the spell was countered in response, and the trigger still counts what was spent', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .battlefield(...SIX)
      .library(...LIBRARY)
      .seat(1)
      .hand(COUNTER)
      .battlefield('Island', 'Island')
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.pass(); // the opponent receives priority with the trigger on the stack
    g.act(1).cast(COUNTER, { targets: [{ name: DRAGON, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(DRAGON, 'graveyard', { seat: 0 });
    expect(kobolds(g)).toBe(6);
    g.expect.invariants();
  });
});

describe('"Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it"', () => {
  test('mana from Sol Ring is artifact mana: two counters on a creature paid with it', () => {
    const g = scenario()
      .seat(0)
      .hand(SPIDER)
      .battlefield(COIN, SOL_RING, 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(SPIDER).payManual([SOL_RING, 'Forest[0]', 'Forest[1]']);
    g.passAll();
    g.expect.counters(SPIDER, { '+1/+1': 2 });
  });

  test('mana from lands is not: no counter on a creature paid with lands alone', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(COIN, 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, {});
  });

  test('a Treasure paid mana from an artifact source: one counter, and the Treasure is gone as the creature enters', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(COIN, 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(COIN);
    g.passAll();
    g.act(0)
      .cast(BEARS)
      .payManual(['Forest', { source: 'Treasure', color: 'G' }]);
    g.passAll();
    g.expect.noObject('Treasure');
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.pt(BEARS, 3, 3);
  });

  test('a Treasure tapped by hand earlier: its mana in the pool still counts as mana from an artifact source', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(COIN, 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(COIN);
    g.passAll();
    g.act(0).tapForMana('Treasure', { color: 'G' });
    g.expect.noObject('Treasure');
    g.expect.pool(0, 'G');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
  });

  test('Sol Ring paid for two of the four mana of a Giant: two counters; the Kobolds it was not cast to make get none', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .battlefield(COIN, SOL_RING, 'Swamp', 'Mountain', 'Forest', 'Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0)
      .cast(DRAGON)
      .payManual([SOL_RING, 'Swamp', 'Mountain', 'Forest', 'Plains[0]', 'Plains[1]']);
    g.passAll();
    // Seven mana made, six spent: Sol Ring's CC paid generic mana, so two of the six came from an artifact source.
    g.expect.counters(DRAGON, { '+1/+1': 2 });
    expect(kobolds(g)).toBe(6);
    for (const token of g.find({ name: KOBOLD, zone: 'battlefield' })) {
      expect(token.counters).toEqual({});
    }
  });

  test('a creature cast without paying its mana cost has no mana spent to cast it (CR 118.9): the cascaded creature gets none', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Cascade Giant')
      .battlefield(COIN, SOL_RING, 'Mountain', 'Mountain')
      .library(BEARS, ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Cascade Giant').payManual([SOL_RING, 'Mountain[0]', 'Mountain[1]']);
    g.pass();
    g.pass(); // the cascade trigger resolves and asks
    g.act(0).accept();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, {});
    g.expect.counters('SYNTHETIC Cascade Giant', { '+1/+1': 2 });
  });

  test('"for each mana spent": all of it counts, whatever made it', () => {
    const g = scenario()
      .seat(0)
      .hand(SPIDER)
      .battlefield(PRESS, 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.counters(SPIDER, { '+1/+1': 4 });
  });

  test('two of them: the counters add up', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(PRESS, COIN, 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 2 });
  });
});

describe('the record on the spell (CR 601.2h)', () => {
  const SIX = ['Swamp', 'Mountain', 'Forest', 'Plains', 'Plains', 'Plains'];
  const cast = (more: readonly string[] = []) => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .battlefield(...SIX, ...more)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    return g;
  };

  test('the spell on the stack says how much was spent and from which card types', () => {
    const g = cast();
    expect(g.object({ name: DRAGON, zone: 'stack' }).stack?.manaSpent).toEqual({
      total: 6,
      fromTypes: { land: 6 },
    });
  });

  test('a source with two card types counts for each (an artifact land)', () => {
    const rock = singleFace({
      name: 'SYNTHETIC Test Gem Land',
      manaCost: null,
      types: ['artifact', 'land'],
      colors: [],
      colorIdentity: [],
      oracleText: '{T}: Add {C}.',
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      ],
    });
    const g = scenario()
      .define(rock)
      .seat(0)
      .hand(DRAGON)
      .battlefield(rock.name, 'Swamp', 'Mountain', 'Forest', 'Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    expect(g.object({ name: DRAGON, zone: 'stack' }).stack?.manaSpent).toEqual({
      total: 6,
      fromTypes: { artifact: 1, land: 6 },
    });
  });

  test('a state whose spell has more mana of a card type than mana is refused by the invariants', () => {
    const g = cast();
    const spell = g.object({ name: DRAGON, zone: 'stack' });
    const bad = {
      ...g.state,
      objects: {
        ...g.state.objects,
        [spell.id]: {
          ...spell,
          stack:
            spell.stack === null
              ? null
              : { ...spell.stack, manaSpent: { total: 2, fromTypes: { land: 3 } } },
        },
      },
    };
    expect(checkInvariants(bad).join('\n')).toMatch(/mana spent that it cannot have/);
  });

  test('a copy of a spell is not cast: it has spent nothing, and the spell it copies keeps what it spent (CR 707.10)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'SYNTHETIC Twin Spell')
      .battlefield('Mountain', 'Island', 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).cast('SYNTHETIC Twin Spell', {
      targets: [{ name: 'Lightning Bolt', zone: 'stack' }],
      pay: true,
    });
    g.pass();
    g.pass(); // the Twin Spell resolves; the copy asks nothing new here (the engine may ask for new targets)
    const onStack = g.find({ name: 'Lightning Bolt', zone: 'stack' });
    expect(onStack.map((o) => o.stack?.manaSpent?.total)).toContain(1);
    const copies = onStack.filter((o) => o.copyOf !== undefined);
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) expect(copy.stack?.manaSpent).toBeUndefined();
  });
});
