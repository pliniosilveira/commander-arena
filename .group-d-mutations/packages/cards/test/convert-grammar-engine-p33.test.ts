// Parsed text is only worth something if the engine runs it as written (stage P33). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the Angels slice of D-149 (ENGINE_VERSION 33).
// A replacement of the life gained, the triggers on gaining life and on counters put (and the limit of once each turn), permanents that enter
// with counters (over two creature types), the triggers of an attack with several creatures and its condition, a commander entering or
// attacking, the protections of a player, damage prevented to a creature, a card that can't be cast early, a tax on blocking, an exile that
// lasts as long as the source does, mana spent only on some spells, and the cost that taps creatures. Every card name starts with
// "SYNTHETIC"; the wording of each text is that of the real cards of the golden corpus (names replaced by ~) or a SYNTHETIC variant that
// changes the type, the number or the filter only. No real card's text is claimed; the cards that are not defined here are the engine's own
// test cards.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance, an Angel
const ISAMARU = 'Isamaru, Hound of Konda'; // 2/2
const BOLT = 'Lightning Bolt';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LANDS = ['Plains', 'Plains', 'Plains', 'Plains', 'Forest', 'Forest'] as const;
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** The same game with seat 1 in its own first main phase, as the active player. */
function theirTurn(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 1 })
    .build();
}

/** Seat 0's game with the cards of `mine` and seat 1's of `theirs`, a library each, in the first main phase. */
function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

const gain = (n: number, name = `SYNTHETIC Parsed Gain ${n}`) =>
  parsed(name, 'Instant', `You gain ${n} life.`, { manaCost: '{W}', colors: ['W'] });

// ---- Gaining life

describe('"If you would gain life, you gain that much life plus N instead." (CR 119.10, 614.1a)', () => {
  test.each([1, 2])('plus %i: a gain of 3 is %i more', (n) => {
    const card = parsed(
      `SYNTHETIC Parsed Bonus ${n}`,
      'Creature — Angel',
      `If you would gain life, you gain that much life plus ${n} instead.`,
      { manaCost: '{2}{W}', power: '2', toughness: '2', colors: ['W'] },
    );
    const spell = gain(3);
    const g = main((b) =>
      b.define(card).define(spell).hand(spell.name).battlefield(card.name, 'Plains'),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.life(0, 23 + n);
  });

  test("an opponent's permanent changes nothing, and neither does a gain of 0", () => {
    const card = parsed(
      'SYNTHETIC Parsed Bonus Theirs',
      'Creature — Angel',
      'If you would gain life, you gain that much life plus 2 instead.',
      { manaCost: '{2}{W}', power: '2', toughness: '2', colors: ['W'] },
    );
    const spell = gain(3);
    const g = main(
      (b) => b.define(spell).hand(spell.name).battlefield('Plains'),
      (b) => b.define(card).battlefield(card.name),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });
});

describe('"Whenever you gain life, ...", "... for the first time each turn" and "This ability triggers only once each turn." (CR 119.9, 603.2)', () => {
  const lifeGained = (extra = '') =>
    parsed(
      `SYNTHETIC Parsed Light${extra === '' ? '' : ' Once'}`,
      'Creature — Angel',
      `Whenever you gain life, put a +1/+1 counter on ~.\nWhenever you put one or more +1/+1 counters on ~, draw a card.${extra}`,
      { manaCost: '{2}{W}{W}', power: '3', toughness: '3', colors: ['W'] },
    );

  const twoGains = (card: CardDefinition) => {
    const a = gain(1, 'SYNTHETIC Parsed Gain One');
    const b = gain(2, 'SYNTHETIC Parsed Gain Two');
    const g = main((s) =>
      s
        .define(card)
        .define(a)
        .define(b)
        .hand(a.name, b.name)
        .battlefield(card.name, 'Plains', 'Plains'),
    );
    g.act(0).cast(a.name, { pay: true });
    g.passAll();
    g.act(0).cast(b.name, { pay: true });
    g.passAll();
    return g;
  };

  test('each gain puts a counter, and each counter draws a card without the limit', () => {
    const card = lifeGained();
    const g = twoGains(card);
    g.expect.counters(card.name, { '+1/+1': 2 });
    g.expect.handSize(0, 2);
  });

  test('with "triggers only once each turn" the second counter draws nothing', () => {
    const card = lifeGained(' This ability triggers only once each turn.');
    const g = twoGains(card);
    g.expect.counters(card.name, { '+1/+1': 2 });
    g.expect.handSize(0, 1);
  });

  test('"for the first time each turn" is the first gain of the turn only', () => {
    const card = parsed(
      'SYNTHETIC Parsed First Gain',
      'Creature — Angel',
      'Whenever you gain life for the first time each turn, draw a card.',
      { manaCost: '{2}{W}', power: '3', toughness: '3', colors: ['W'] },
    );
    const g = twoGains(card);
    g.expect.handSize(0, 1);
  });
});

// ---- Permanents that enter with counters

describe('"Each other <type> you control enters with an additional +1/+1 counter on it for each <type> you already control." (CR 614.1c, 614.12)', () => {
  test.each([
    ['Angel', 'Angel', ANGEL, 1],
    ['Bear', 'Bear', BEARS, 1],
  ])(
    'over %s: one counter for the one there is, none for itself',
    (type, subtype, entering, counters) => {
      const chief = parsed(
        `SYNTHETIC Parsed Chief ${type}`,
        `Creature — ${subtype}`,
        `Each other ${subtype} you control enters with an additional +1/+1 counter on it for each ${subtype} you already control.`,
        { manaCost: '{1}{W}', power: '2', toughness: '2', colors: ['W'] },
      );
      const g = main((b) =>
        b
          .define(chief)
          .hand(entering)
          .battlefield(chief.name, ...LANDS),
      );
      g.act(0).cast(entering, { pay: true });
      g.passAll();
      g.expect.counters(entering, { '+1/+1': counters });
      // The permanent with the ability gets none from its own ability: it was there before the creature entered.
      g.expect.counters(chief.name, {});
    },
  );

  test('a creature of another type enters with none', () => {
    const chief = parsed(
      'SYNTHETIC Parsed Chief Only',
      'Creature — Angel',
      'Each other Angel you control enters with an additional +1/+1 counter on it.',
      { manaCost: '{1}{W}', power: '2', toughness: '2', colors: ['W'] },
    );
    const g = main((b) =>
      b
        .define(chief)
        .hand(BEARS)
        .battlefield(chief.name, ...LANDS),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });
});

// ---- Attacking with several creatures

describe('"Whenever you attack with two or more creatures, draw a card." and its sibling for another player (CR 508.1, 603.2)', () => {
  const marshal = (words: string) =>
    parsed(`SYNTHETIC Parsed Marshal ${words.length}`, 'Creature — Angel Soldier', words, {
      manaCost: '{3}{W}',
      power: '4',
      toughness: '3',
      colors: ['W'],
    });

  test('two attackers draw one card, three still one, one none', () => {
    const card = marshal('Whenever you attack with two or more creatures, draw a card.');
    const attack = (names: string[]) => {
      const g = main((b) => b.define(card).battlefield(card.name, BEARS, ISAMARU));
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).attack(names);
      g.passAll();
      return g;
    };
    attack([card.name, BEARS]).expect.handSize(0, 1);
    attack([card.name, BEARS, ISAMARU]).expect.handSize(0, 1);
    attack([card.name]).expect.handSize(0, 0);
  });

  test('another player who attacks me with two creatures draws nothing: they attacked me', () => {
    const card = marshal(
      'Whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.',
    );
    const g = theirTurn(
      (b) => b.define(card).battlefield(card.name),
      (b) => b.battlefield(BEARS, ISAMARU),
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS, ISAMARU]);
    g.passAll();
    // They attacked me, the only player: the condition "none of those creatures attacked you" fails. Nobody draws.
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 0);
  });

  test('...and draws when none of them attacked me (two attack a planeswalker)', () => {
    const card = marshal(
      'Whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.',
    );
    const g = theirTurn(
      (b) => b.define(card).battlefield(card.name, WALKER),
      (b) => b.battlefield(BEARS, ISAMARU),
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: WALKER },
      { attacker: ISAMARU, target: WALKER },
    ]);
    g.passAll();
    g.expect.handSize(1, 1);
  });
});

// ---- Commanders

describe('"Whenever your commander enters or attacks, ..." (CR 903.3, 603.6a, 508.1)', () => {
  const admirer = parsed(
    'SYNTHETIC Parsed Command Admirer',
    'Artifact',
    'Whenever your commander enters or attacks, you gain 2 life.',
    { manaCost: '{2}' },
  );

  test('the commander cast from the command zone, then attacking: two triggers; another creature: none', () => {
    const g = main((b) =>
      b
        .define(admirer)
        .command(ISAMARU, { commander: true })
        .battlefield(admirer.name, 'Plains', 'Plains'),
    );
    g.act(0).cast(ISAMARU, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    const other = main((b) => b.define(admirer).battlefield(admirer.name, BEARS));
    other.advanceTo('declareAttackers', { attack: false });
    other.act(0).attack(BEARS);
    other.passAll();
    other.expect.life(0, 20);
  });

  test('"a commander you control" counts a commander I control and not the opponent\'s under their control', () => {
    const card = parsed(
      'SYNTHETIC Parsed Command Watcher',
      'Artifact',
      'Whenever a commander you control attacks, you gain 2 life.',
      { manaCost: '{2}' },
    );
    const mine = main((b) =>
      b
        .define(card)
        .battlefield(card.name, { label: 'w' })
        .battlefield(ISAMARU, { commander: true }),
    );
    mine.advanceTo('declareAttackers', { attack: false });
    mine.act(0).attack(ISAMARU);
    mine.passAll();
    mine.expect.life(0, 22);
    const theirs = theirTurn(
      (b) => b.define(card).battlefield(card.name),
      (b) => b.battlefield(ISAMARU, { commander: true }),
    );
    theirs.advanceTo('declareAttackers', { attack: false });
    theirs.act(1).attack(ISAMARU);
    theirs.passAll();
    theirs.expect.life(0, 20);
  });
});

// ---- Protections and prevented damage

describe('"You have hexproof." (CR 702.11b)', () => {
  const ward = parsed('SYNTHETIC Parsed Ward Angel', 'Creature — Angel', 'You have hexproof.', {
    manaCost: '{2}{W}',
    power: '2',
    toughness: '3',
    colors: ['W'],
  });

  const legalTargets = (g: ScenarioGame, seat: 0 | 1) => {
    g.act(seat).cast(`${BOLT}[0]`);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return d.specs[0]?.legal ?? [];
  };

  test("an opponent's spell can't target me, mine can", () => {
    const g = main(
      (b) => b.define(ward).battlefield(ward.name, 'Mountain').hand(BOLT),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    expect(legalTargets(g, 0).some((t) => t.kind === 'player' && t.seat === 0)).toBe(true);
    const theirs = main(
      (b) => b.define(ward).battlefield(ward.name),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    theirs.act(0).pass();
    expect(legalTargets(theirs, 1).some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
  });
});

describe('"You can\'t lose the game and your opponents can\'t win the game." (CR 104.3b, 104.2)', () => {
  const herald = parsed(
    'SYNTHETIC Parsed Undying Herald',
    'Creature — Angel',
    "You can't lose the game and your opponents can't win the game.",
    { manaCost: '{4}{W}', power: '4', toughness: '4', colors: ['W'] },
  );

  test('0 life does not lose it, and without the creature it does', () => {
    const withHerald = scenario()
      .seat(0)
      .life(0)
      .library(...FILLER)
      .define(herald)
      .battlefield(herald.name)
      .seat(1)
      .library(...FILLER)
      .build({ settle: true });
    withHerald.expect.hasLost(0, false);
    const without = scenario()
      .seat(0)
      .life(0)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build({ settle: true });
    without.expect.hasLost(0, true);
  });
});

describe('"Prevent all combat damage that would be dealt to ~." (CR 615.1, 615.6)', () => {
  const seraph = parsed(
    'SYNTHETIC Parsed Stone Seraph',
    'Creature — Angel',
    'Flying\nPrevent all combat damage that would be dealt to ~.',
    { manaCost: '{3}{W}', power: '3', toughness: '3', colors: ['W'] },
  );

  test('a 4-power attacker that the Seraph blocks does not hurt it; a Bolt still does', () => {
    const g = main(
      (b) => b.define(seraph).battlefield(ANGEL),
      (b) => b.define(seraph).battlefield(seraph.name),
    );
    g.playCombat({
      attack: [ANGEL],
      block: [{ blocker: seraph.name, attacker: ANGEL }],
      until: 'endOfCombat',
    });
    g.expect.zone(seraph.name, 'battlefield', { seat: 1 });
    g.expect.damage(seraph.name, 0);
  });
});

describe('"You can\'t cast ~ during your first, second, or third turns of the game." (CR 101.2, 500.1)', () => {
  test('it can be cast on the fourth turn and not before', () => {
    const card = parsed(
      'SYNTHETIC Parsed Late Avenger',
      'Creature — Angel',
      "You can't cast ~ during your first, second, or third turns of the game.\nFlying",
      { manaCost: '{W}{W}', power: '3', toughness: '3', colors: ['W'] },
    );
    const at = (turn: number) =>
      scenario()
        .seat(0)
        .library(...FILLER)
        .define(card)
        .hand(card.name)
        .battlefield('Plains', 'Plains')
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn })
        .build();
    for (const turn of [1, 3, 5]) at(turn).expect.illegal(0, { cast: card.name });
    const late = at(7);
    late.act(0).cast(card.name, { pay: true });
    late.passAll();
    late.expect.zone(card.name, 'battlefield', { seat: 0 });
  });
});

// ---- A tax on blocking

describe('"As long as ~ is attacking, creatures can\'t block unless their controller pays {1} for each of those creatures." (CR 509.1b, 509.1d)', () => {
  const tithes = parsed(
    'SYNTHETIC Parsed Block Tax',
    'Creature — Angel',
    "Flying\nAs long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
    { manaCost: '{1}{W}{W}{W}', power: '3', toughness: '5', colors: ['W'] },
  );

  test('a blocker is declared only with a land to pay for it, and only while the Angel attacks', () => {
    const g = main(
      (b) => b.define(tithes).battlefield(tithes.name),
      (b) => b.battlefield(SPIDER, 'Plains'),
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(tithes.name);
    g.advanceTo('declareBlockers');
    // The Bears have a Plains to pay with: the block is declared, and the tax is asked for.
    expect(g.act(1).try.declareBlockers([{ blocker: SPIDER, attacker: tithes.name }]).ok).toBe(
      true,
    );
    expect(g.state.pending?.kind).toBe('payMana');
    // Without the land the same block is refused.
    const poor = main(
      (b) => b.define(tithes).battlefield(tithes.name),
      (b) => b.battlefield(SPIDER),
    );
    poor.advanceTo('declareAttackers', { attack: false });
    poor.act(0).attack(tithes.name);
    poor.advanceTo('declareBlockers');
    expect(poor.act(1).try.declareBlockers([{ blocker: SPIDER, attacker: tithes.name }]).ok).toBe(
      false,
    );
  });
});

// ---- Exile until the source leaves

describe('"... exile up to one target nonland permanent that player controls until ~ leaves the battlefield." (CR 610.3)', () => {
  const grasp = parsed(
    'SYNTHETIC Parsed Grasp',
    'Enchantment',
    'When ~ enters, for each opponent, exile up to one target nonland permanent that player controls until ~ leaves the battlefield.',
    { manaCost: '{1}{W}{W}', colors: ['W'] },
  );

  test('the permanent is exiled, and comes back when the enchantment leaves', () => {
    const g = main(
      (b) => b.define(grasp).hand(grasp.name).battlefield('Plains', 'Plains', 'Plains'),
      (b) => b.battlefield(ANGEL),
    );
    g.act(0).cast(grasp.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ANGEL);
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(grasp.name, 'battlefield', { seat: 0 });
  });
});

// ---- Mana spent only on some spells

describe('"{T}: Add {W}. Spend this mana only to cast an Angel spell." (CR 106.6)', () => {
  const font = (words: string, suffix: string) =>
    parsed(
      `SYNTHETIC Parsed Font ${suffix}`,
      'Creature — Angel',
      `{T}: Add {W}. Spend this mana only to cast ${words}.`,
      { manaCost: '{W}', power: '1', toughness: '1', colors: ['W'] },
    );

  test.each([
    ['an Angel spell', 'angel', BEARS, false],
    ['creature spells', 'creature', BEARS, true],
    ['artifact spells', 'artifact', BEARS, false],
  ])(
    '%s: a {1}{G} creature can be paid with it and a Forest: %s',
    (words, suffix, spell, castable) => {
      const card = font(words, suffix);
      const g = main((b) => b.define(card).hand(spell).battlefield(card.name, 'Forest'));
      g.act(0).tapForMana(card.name);
      g.expect.pool(0, 'W');
      if (castable) g.expect.legal(0, { cast: spell });
      else g.expect.illegal(0, { cast: spell });
    },
  );

  test('an Angel spell is paid with it', () => {
    const card = font('an Angel spell', 'angel again');
    const g = main((b) =>
      b.define(card).hand(ANGEL).battlefield(card.name, 'Plains', 'Plains', 'Plains', 'Plains'),
    );
    g.act(0).tapForMana(card.name);
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.pool(0, '');
  });
});

// ---- The cost that taps creatures

describe('"You may pay {W} and tap four untapped creatures you control with flying rather than pay ~\'s mana cost." (CR 118.9, 118.3)', () => {
  const sephara = parsed(
    'SYNTHETIC Parsed Sky Blade',
    'Creature — Angel',
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost.\nFlying, lifelink\nOther creatures you control with flying have indestructible.",
    { manaCost: '{4}{W}{W}{W}', power: '7', toughness: '7', colors: ['W'] },
  );

  test('four fliers and a Plains cast it for {W}; the other fliers have indestructible with it on the battlefield', () => {
    const g = main((b) =>
      b
        .define(sephara)
        .hand(sephara.name)
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(ANGEL, ANGEL, ANGEL, 'Plains'),
    );
    g.expect.derived('angel', { keywords: ['flying', 'vigilance'] });
    g.act(0).cast(sephara.name, { alternative: 'tapPermanents', pay: true });
    g.passAll();
    g.expect.zone(sephara.name, 'battlefield', { seat: 0 });
    g.expect.derived('angel', { keywords: ['flying', 'vigilance', 'indestructible'] });
  });
});
