// The Quandrix Unlimited deck, group G: the REAL Oracle text of Guardian Augmenter, Ingenious Prodigy, Quandrix Apprentice, Zimone All-Questioning, Primo the Unbounded, Deekah,
// Elusive Otter // Grove's Bounty and Zimone's Hypothesis (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 903.3 (commanders), CR 702.11 (hexproof), CR 107.3m (enters with X counters), CR 208.4b (base power),
// CR 601.2d (dividing among targets), CR 603.4 (an intervening if), CR 608.2c (if you do), CR 401.4 (the order of the cards put on the bottom), CR 608.2d (a choice as it resolves).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Guardian Augmenter', () => {
  const augmenter = real('Guardian Augmenter');

  test('commanders you control have hexproof: an opponent cannot target the commander but can target another creature', () => {
    const board = () =>
      scenario()
        .define(augmenter)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(augmenter.name)
        .battlefield(BEARS, { commander: true, label: 'commander' })
        .battlefield(SPIDER, { label: 'other' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield('Mountain', 'Mountain')
        .hand(BOLT)
        .at('precombatMain', { active: 0 })
        .build();
    const g = board();
    g.expect.derived('commander', { keywords: ['hexproof'] });
    g.expect.pt('commander', 4, 4); // its other line: commander creatures you control get +2/+2
    g.act(0).pass();
    expect(() => g.act(1).cast(BOLT, { targets: ['commander'], pay: true })).toThrow();
    const h = board();
    h.act(0).pass();
    h.act(1).cast(BOLT, { targets: ['other'], pay: true });
    h.expect.invariants();
  });
});

describe('Primo, the Unbounded', () => {
  const primo = real('Primo, the Unbounded');
  const PRIMO = primo.name;
  const zero = parsed('SYNTHETIC Zero Power', 'Creature — Wizard', '', {
    manaCost: '{1}',
    power: '0',
    toughness: '1',
  });
  const start = (configure: (b: ReturnType<typeof scenario>) => void = () => undefined) => {
    const b = scenario().define(primo).define(zero);
    b.seat(0)
      .life(20)
      .library(...LIBRARY);
    configure(b);
    b.seat(1)
      .life(20)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('enters with twice X +1/+1 counters (CR 107.3m): X = 2 gives four, a 4/4 with trample', () => {
    const g = start((b) =>
      b.seat(0).hand(PRIMO).battlefield('Forest', 'Forest', 'Island', 'Forest', 'Forest'),
    );
    g.act(0).cast(PRIMO, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(PRIMO, 'battlefield', { seat: 0 });
    g.expect.counters(PRIMO, { '+1/+1': 4 });
    g.expect.pt(PRIMO, 4, 4);
    g.expect.derived(PRIMO, { keywords: ['trample'] });
    g.expect.invariants();
  });

  test('X = 0 enters with no counter and dies as a 0/0', () => {
    const g = start((b) => b.seat(0).hand(PRIMO).battlefield('Forest', 'Forest', 'Island'));
    g.act(0).cast(PRIMO, { x: 0, pay: true });
    g.passAll();
    g.expect.zone(PRIMO, 'graveyard', { seat: 0 });
  });

  test('a creature with base power 0 that deals combat damage makes a Fractal with that many counters', () => {
    const g = start((b) =>
      b.seat(0).battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('primo');
    g.advanceTo('combatDamage');
    g.expect.life(1, 16);
    g.expect.stack([`${PRIMO} (ability)`]);
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 4 });
    g.expect.pt('Fractal', 4, 4);
    g.expect.invariants();
  });

  test('one or more: two base-power-0 creatures dealing damage together make one Fractal with all the damage', () => {
    const g = start((b) =>
      b
        .seat(0)
        .battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } })
        .battlefield(zero.name, { label: 'second', counters: { '+1/+1': 2 } }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(['primo', 'second']);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 6 });
  });

  test('a creature whose base power is not 0 does not trigger it, whatever its power is', () => {
    const g = start((b) =>
      b
        .seat(0)
        .battlefield(PRIMO, { label: 'primo', counters: { '+1/+1': 4 } })
        .battlefield(BEARS, { label: 'bears' }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack('bears');
    g.advanceTo('combatDamage');
    g.expect.stack([]);
    g.expect.noObject('Fractal');
  });
});

describe('Deekah, Fractal Theorist', () => {
  const deekah = real('Deekah, Fractal Theorist');
  const DEEKAH = deekah.name;
  const start = (configure: (b: ReturnType<typeof scenario>) => void = () => undefined) => {
    const b = scenario().define(deekah);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(DEEKAH);
    configure(b);
    b.seat(1)
      .life(20)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('casting an instant makes a 0/0 Fractal with counters equal to the spell mana value (CR 202.3)', () => {
    const g = start((b) => b.seat(0).hand(BOLT).battlefield('Mountain'));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${DEEKAH} (ability)`, BOLT]);
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    g.expect.counters('Fractal', { '+1/+1': 1 });
    g.expect.pt('Fractal', 1, 1);
    g.expect.derived('Fractal', { colors: ['G', 'U'] });
    g.expect.invariants();
  });

  test('a creature spell is no instant or sorcery: no Fractal', () => {
    const g = start((b) => b.seat(0).hand(BEARS).battlefield('Forest', 'Forest'));
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.passAll();
    g.expect.noObject('Fractal');
  });

  const withToken = () => {
    const g = start((b) =>
      b
        .seat(0)
        .hand(BOLT)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield('Mountain', 'Island', 'Island', 'Island', 'Island'),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone('Fractal', 'battlefield', { seat: 0, count: 1 });
    return g;
  };

  test('{3}{U}: target creature token can target the Fractal', () => {
    const g = withToken();
    g.act(0).activate(DEEKAH, { targets: ['Fractal'], pay: true });
    g.expect.stack([`${DEEKAH} (ability)`]);
    g.passAll();
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a creature that is no token is not a target of it', () => {
    const g = withToken();
    expect(() => g.act(0).activate(DEEKAH, { targets: ['bears'], pay: true })).toThrow();
  });
});

describe("Elusive Otter // Grove's Bounty", () => {
  const card = real("Elusive Otter // Grove's Bounty");
  const OTTER = card.name;
  const zero = parsed('SYNTHETIC Zero Power Blocker', 'Creature — Wizard', '', {
    manaCost: '{1}',
    power: '0',
    toughness: '3',
  });

  test('creatures with power less than its power cannot block it, the others can', () => {
    const g = scenario()
      .define(card)
      .define(zero)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OTTER, { label: 'otter' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(zero.name, { label: 'zero' })
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('otter');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('zero', 'otter', false);
    g.expect.canBlock('bears', 'otter', true);
  });

  test('its power is read as it is: prowess makes it 2, so a 1-power creature cannot block it either', () => {
    const one = parsed('SYNTHETIC One Power Blocker', 'Creature — Wizard', '', {
      manaCost: '{1}',
      power: '1',
      toughness: '3',
    });
    const g = scenario()
      .define(card)
      .define(one)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OTTER, { label: 'otter' })
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(one.name, { label: 'one' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('otter');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('one', 'otter', true);
    const h = scenario()
      .define(card)
      .define(one)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OTTER, { label: 'otter' })
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(one.name, { label: 'one' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    h.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    h.passAll();
    h.expect.pt('otter', 2, 2); // prowess
    h.advanceTo('declareAttackers');
    h.act(0).attack('otter');
    h.advanceTo('declareBlockers');
    // no creature can block it, so the declareBlockers decision is not even offered
    expect(h.state.pending?.kind).not.toBe('declareBlockers');
  });

  describe("Grove's Bounty", () => {
    const board = () =>
      scenario()
        .define(card)
        .seat(0)
        .library(...LIBRARY)
        .hand(OTTER)
        .battlefield(BEARS, { label: 'a' })
        .battlefield(SPIDER, { label: 'b' })
        .battlefield('Forest', 'Forest', 'Forest', 'Forest')
        .seat(1)
        .library(...LIBRARY)
        .battlefield('Llanowar Elves', { label: 'theirs' })
        .battlefield('Mountain')
        .hand(BOLT)
        .at('precombatMain', { active: 0, priority: 0 })
        .build();

    test('X = 3 divided 1 and 2 among two creatures you control (CR 601.2d); the card goes on its adventure', () => {
      const g = board();
      g.act(0).cast(OTTER, { face: 1, x: 3, targets: ['a', 'b'], divide: [1, 2], pay: true });
      g.passAll();
      g.expect.counters('a', { '+1/+1': 1 });
      g.expect.counters('b', { '+1/+1': 2 });
      g.expect.zone(OTTER, 'exile', { seat: 0 });
      g.expect.invariants();
    });

    test('the whole of X can go to one creature, and a creature you do not control is no target', () => {
      const g = board();
      g.act(0).cast(OTTER, { face: 1, x: 2, targets: ['b'], divide: [2], pay: true });
      g.passAll();
      g.expect.counters('b', { '+1/+1': 2 });
      const h = board();
      expect(() =>
        h.act(0).cast(OTTER, { face: 1, x: 2, targets: ['theirs'], divide: [2], pay: true }),
      ).toThrow();
    });

    test('the division must give out all of X, each target at least 1', () => {
      expect(() => {
        const g = board();
        g.act(0).cast(OTTER, { face: 1, x: 3, targets: ['a', 'b'], divide: [1, 1], pay: true });
      }).toThrow();
      expect(() => {
        const g = board();
        g.act(0).cast(OTTER, { face: 1, x: 3, targets: ['a', 'b'], divide: [3, 0], pay: true });
      }).toThrow();
    });

    test('a target that left the battlefield gets nothing; the others keep their share (CR 608.2b)', () => {
      const g = board();
      g.act(0).cast(OTTER, { face: 1, x: 3, targets: ['a', 'b'], divide: [1, 2], pay: true });
      // the opponent kills creature a in response: its share is lost and not given to the other (CR 608.2b)
      g.act(0).pass();
      g.act(1).cast(BOLT, { targets: ['a'], pay: true });
      g.passAll();
      g.expect.noObject(BEARS, { zone: 'battlefield' });
      g.expect.counters('b', { '+1/+1': 2 });
      g.expect.invariants();
    });
  });
});

describe('Ingenious Prodigy', () => {
  const prodigy = real('Ingenious Prodigy');
  const PRODIGY = prodigy.name;
  const board = (counters: Record<string, number>) =>
    scenario()
      .define(prodigy)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(PRODIGY, { counters })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('enters with X +1/+1 counters (CR 107.3m): X = 2 makes it a 2/3', () => {
    const g = scenario()
      .define(prodigy)
      .seat(0)
      .library(...LIBRARY)
      .hand(PRODIGY)
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PRODIGY, { x: 2, pay: true });
    g.passAll();
    g.expect.counters(PRODIGY, { '+1/+1': 2 });
    g.expect.pt(PRODIGY, 2, 3);
    g.expect.derived(PRODIGY, { keywords: ['skulk'] });
  });

  test('upkeep with a counter on it: you may remove one, and if you do you draw a card', () => {
    const g = board({ '+1/+1': 2 });
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.stack([`${PRODIGY} (ability)`]);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.counters(PRODIGY, { '+1/+1': 1 });
    g.expect.handSize(0, hand + 1);
    g.expect.invariants();
  });

  test('declining the offer removes no counter and draws no card', () => {
    const g = board({ '+1/+1': 2 });
    g.advanceTo('upkeep', { turn: 5 });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.counters(PRODIGY, { '+1/+1': 2 });
    g.expect.handSize(0, hand);
  });

  test('with no +1/+1 counter on it the ability does not trigger (the intervening if, CR 603.4)', () => {
    const g = board({ charge: 1 });
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.stack([]);
  });
});

describe('Quandrix Apprentice', () => {
  const apprentice = real('Quandrix Apprentice');
  const LABELS = ['a', 'b', 'c', 'd'] as const;
  const game = (top: readonly string[]) => {
    const b = scenario().define(apprentice).seat(0).hand(BOLT);
    b.battlefield(apprentice.name, 'Mountain');
    for (const [i, name] of top.entries()) b.library(name, { label: LABELS[i] ?? `x${i}` });
    for (let i = 0; i < 3; i++) b.library('Plains', { label: `z${i}` });
    return b
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('casting an instant: a land of the top three goes to the hand, the rest go to the bottom in the order the owner chooses', () => {
    const g = game(['Grizzly Bears', 'Forest', 'Serra Angel']);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${apprentice.name} (ability)`, BOLT]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('b');
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['c', 'a'] });
    expect(g.state.seats[0]?.library).toEqual(['z0', 'z1', 'z2', 'c', 'a'].map((l) => g.id(l)));
    g.expect.invariants();
  });

  test('you may take none: all three go to the bottom', () => {
    const g = game(['Grizzly Bears', 'Forest', 'Serra Angel']);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).arrange({ top: [], other: ['b', 'a', 'c'] });
    g.expect.zone('Forest', 'library', { seat: 0 });
    g.expect.handSize(0, 0);
    expect(g.state.seats[0]?.library.length).toBe(6);
  });

  test('a creature spell is not an instant or a sorcery: nothing is looked at', () => {
    const g = scenario()
      .define(apprentice)
      .seat(0)
      .hand(BEARS)
      .battlefield(apprentice.name, 'Forest', 'Forest')
      .library('Forest', 'Plains', 'Plains')
      .seat(1)
      .library('Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });
});

describe('Zimone, All-Questioning', () => {
  const zimone = real('Zimone, All-Questioning');
  const ZIMONE = zimone.name;
  const start = (lands: number, hand: readonly string[] = []) => {
    const b = scenario()
      .define(zimone)
      .seat(0)
      .library(...LIBRARY);
    // Zimone is one of the permanents, not a land: `lands` basic lands on the battlefield.
    b.battlefield(ZIMONE, ...Array.from({ length: lands }, () => 'Forest'));
    if (hand.length > 0) b.hand(...hand);
    return b
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('the card reads: an intervening if of two conditions, and a legendary named token', () => {
    const trigger = zimone.faces[0]?.abilities[0];
    expect(trigger).toMatchObject({
      kind: 'triggered',
      interveningIf: {
        kind: 'and',
        terms: [{ kind: 'enteredThisTurn' }, { kind: 'amountIsPrime' }],
      },
    });
  });

  test('a land entered this turn and you control 3 lands (prime): Primo, the Indivisible enters with 3 +1/+1 counters', () => {
    const g = start(2, ['Forest']);
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    g.expect.stack([`${ZIMONE} (ability)`]);
    g.passAll();
    g.expect.zone('Primo, the Indivisible', 'battlefield', { seat: 0 });
    g.expect.counters('Primo, the Indivisible', { '+1/+1': 3 });
    g.expect.pt('Primo, the Indivisible', 3, 3);
    g.expect.derived('Primo, the Indivisible', { colors: ['G', 'U'] });
    g.expect.invariants();
  });

  test('a land entered this turn but you control 4 lands (not prime): nothing', () => {
    const g = start(3, ['Forest']);
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    g.expect.stack([]);
    g.expect.noObject('Primo, the Indivisible');
  });

  test('you control a prime number of lands but none entered this turn: nothing', () => {
    const g = start(3);
    g.advanceTo('end');
    g.expect.stack([]);
    g.expect.noObject('Primo, the Indivisible');
  });

  test('1 is not a prime number', () => {
    const g = start(0, ['Forest']);
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    g.expect.stack([]);
  });
});

describe("Zimone's Hypothesis", () => {
  const hypothesis = real("Zimone's Hypothesis");
  const HYP = hypothesis.name;
  const game = () =>
    scenario()
      .define(hypothesis)
      .seat(0)
      .library(...LIBRARY)
      .hand(HYP)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'bears' }) // 2/2
      .battlefield('Llanowar Elves', { label: 'elves' }) // 1/1
      .battlefield('Serra Angel', { label: 'angel' }) // 4/4
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Raging Goblin', { label: 'goblin' }) // 1/1
      .battlefield(SPIDER, { label: 'spider' }) // 2/4
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('no counter, odd: every creature with an odd power (1) goes to its owner’s hand, whoever controls it', () => {
    const g = game();
    g.act(0).cast(HYP, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.act(0).chooseOption('odd');
    g.expect.zone('Llanowar Elves', 'hand', { seat: 0 });
    g.expect.zone('Raging Goblin', 'hand', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('even: the creatures with an even power (2 and 4) go to their owners’ hands', () => {
    const g = game();
    g.act(0).cast(HYP, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.act(0).chooseOption('even');
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 1 });
  });

  test("the counter is put first: an opponent's 1/1 becomes 2/2, so it is even and not odd (CR 608.2c: in order)", () => {
    const g = game();
    g.act(0).cast(HYP, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('goblin');
    g.expect.counters('goblin', { '+1/+1': 1 });
    g.act(0).chooseOption('odd');
    // the Goblin is 2/2 now: even, it stays; the Elves still have 1 power: odd, it returns
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'hand', { seat: 0 });
  });

  test('zero is even', () => {
    const zero = parsed('SYNTHETIC Zero Even', 'Creature — Wizard', '', {
      manaCost: '{1}',
      power: '0',
      toughness: '3',
    });
    const g = scenario()
      .define(hypothesis)
      .define(zero)
      .seat(0)
      .library(...LIBRARY)
      .hand(HYP)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(zero.name)
      .battlefield('Llanowar Elves')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(HYP, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.act(0).chooseOption('even');
    g.expect.zone(zero.name, 'hand', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
  });
});

describe('"it" after an intervening if about ~ (side effect of Ingenious Prodigy: Mana Vault now reads)', () => {
  const vault = real('Mana Vault');

  test('at the beginning of your draw step, if it is tapped, it deals 1 damage to you', () => {
    const g = scenario()
      .define(vault)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(vault.name, { tapped: true })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('draw', { turn: 5 });
    g.expect.stack([`${vault.name} (ability)`]);
    g.passAll();
    g.expect.life(0, 19);
  });

  test('untapped, it does not trigger', () => {
    const g = scenario()
      .define(vault)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(vault.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('draw', { turn: 5 });
    g.expect.stack([]);
  });
});

describe('a different wording is not read (a card is supported or unsupported, never partly)', () => {
  const status = (type: string, text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Refused',
        typeLine: type,
        oracleText: text,
        manaCost: '{X}{G}',
        power: type.startsWith('Creature') ? '1' : undefined,
        toughness: type.startsWith('Creature') ? '1' : undefined,
      }),
    ).support.status;

  test.each([
    ['Instant', 'Distribute X +1/+1 counters among target creatures you control.'],
    ['Instant', 'Distribute X +1/+1 counters among up to three target creatures you control.'],
    [
      'Creature — Wizard',
      '{T}: Distribute X +1/+1 counters among any number of target creatures you control.',
    ],
    [
      'Creature — Wizard',
      'At the beginning of your upkeep, you may remove a +1/+1 counter from target creature. If you do, draw a card.',
    ],
    [
      'Creature — Wizard',
      'At the beginning of your upkeep, you may remove all +1/+1 counters from ~. If you do, draw a card.',
    ],
    [
      'Creature — Wizard',
      'Whenever you cast an instant spell, create a 0/0 green Fractal creature token. Put that many +1/+1 counters on it.',
    ],
    [
      'Creature — Wizard',
      'At the beginning of your end step, if you control an even number of lands, draw a card.',
    ],
    [
      'Instant',
      'Choose odd or even. Return each creature with toughness of the chosen quality to its owner’s hand.',
    ],
    [
      'Instant',
      'You may put a +1/+1 counter on a creature. You may put a +1/+1 counter on a creature.',
    ],
    ['Creature — Wizard', 'Commanders you control have flash.'],
  ])('%s: %s', (type, text) => {
    expect(status(type, text)).not.toBe('supported');
  });
});
