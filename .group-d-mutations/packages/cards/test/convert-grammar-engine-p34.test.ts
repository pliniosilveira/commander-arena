// Parsed text is only worth something if the engine runs it as written (stage P34). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the Dragons slice of D-151 (ENGINE_VERSION 34).
// Exiling the top cards and playing them, Discover and its Treasures, "exile until a nonland card, cast it", a permanent shuffled in and the
// top card revealed, an additional combat phase with the attackers untapped, Dethrone, "pay any amount" with the reflexive damage, a creature
// put onto the battlefield tapped and attacking, "each other opponent" and the lines that must not be read. Every card name starts with
// "SYNTHETIC"; the wording of each text is that of the real cards of the golden corpus (names replaced by ~) or a SYNTHETIC variant that
// changes the type, the number or the filter only. No real card's text is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const BEARS = 'Grizzly Bears'; // {1}{G}, 2/2
const ANGEL = 'Serra Angel'; // {3}{W}{W}, 4/4
const BOLT = 'Lightning Bolt';
const RED5 = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

// ---- Exile the top cards, and play them

describe('"Exile the top N cards of your library. You may play them this turn." (CR 701.13, 601.2, 305.1)', () => {
  const rite = (count: string) =>
    parsed(
      `SYNTHETIC Parsed Impulse ${count}`,
      'Sorcery',
      `Exile the top ${count} cards of your library. You may play them this turn.`,
      { manaCost: '{1}{R}', colors: ['R'] },
    );

  test.each([
    ['two', 2],
    ['three', 3],
  ])('%s: that many go to exile, and a spell there can be cast for its cost', (word, count) => {
    const card = rite(word);
    const g = scenario()
      .seat(0)
      .hand(card.name)
      .define(card)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(BOLT, 'Forest', 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    expect(g.state.exile).toHaveLength(count);
    g.expect.legal(0, { cast: BOLT });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('the permission ends with the turn', () => {
    const card = rite('two');
    const g = scenario()
      .seat(0)
      .hand(card.name)
      .define(card)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(BOLT, 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: BOLT });
  });
});

// ---- Discover

describe('"Discover N." and the Treasures for the difference (CR 701.57, 111.10a)', () => {
  const discover = parsed(
    'SYNTHETIC Parsed Discover',
    'Sorcery',
    "Discover 4. If the discovered card's mana value is less than 4, create a number of Treasure tokens equal to the difference.",
    { manaCost: '{3}{R}', colors: ['R'] },
  );
  const game = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .define(discover)
      .library(...library)
      .hand(discover.name)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();
  const treasures = (g: ReturnType<typeof game>) =>
    g.state.battlefield.filter((id) =>
      g.state.objects[id]?.token?.characteristics.subtypes.includes('Treasure'),
    );

  test('the first nonland card of mana value 4 or less is cast free: Bears is 2, so two Treasures', () => {
    const g = game(['Mountain', ANGEL, BEARS, 'Mountain', 'Mountain']);
    g.act(0).cast(discover.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.stack([BEARS]);
    expect(treasures(g)).toHaveLength(2);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declined: the card goes into my hand, and the Treasures are made all the same', () => {
    const g = game([BEARS, 'Mountain']);
    g.act(0).cast(discover.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    expect(treasures(g)).toHaveLength(2);
  });

  test('a card of mana value 4: no difference, no Treasure', () => {
    const g = game(['Giant Spider', 'Mountain']);
    g.act(0).cast(discover.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(treasures(g)).toHaveLength(0);
  });
});

// ---- Exile until a nonland card, cast it

describe('"Exile cards from the top of your library until you exile a nonland card. You may cast it ... if that spell\'s mana value is N or less. If you don\'t, put that card into your hand." (CR 701.20, 608.2g)', () => {
  const hoard = parsed(
    'SYNTHETIC Parsed Hoard',
    'Enchantment',
    "When ~ enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 3 or less. If you don't, put that card into your hand.",
    { manaCost: '{3}{R}', colors: ['R'] },
  );
  const game = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .define(hoard)
      .library(...library)
      .hand(hoard.name)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();

  test('a card of mana value 3 or less may be cast; the lands exiled stay in exile', () => {
    const g = game(['Mountain', 'Mountain', BEARS, 'Mountain']);
    g.act(0).cast(hoard.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    g.expect.stack([BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.exile).toHaveLength(2);
  });

  test('a card over 3 cannot be cast and goes into my hand', () => {
    const g = game(['Mountain', ANGEL, 'Mountain']);
    g.act(0).cast(hoard.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
  });
});

// ---- A permanent shuffled in, the top card revealed

describe('"The owner of target creature shuffles it into their library, then reveals the top card of their library. If it\'s a creature card, they put it onto the battlefield." (CR 701.20, 701.24, 110.2a)', () => {
  const warp = parsed(
    'SYNTHETIC Parsed Warp',
    'Instant',
    "The owner of target creature shuffles it into their library, then reveals the top card of their library. If it's a creature card, they put it onto the battlefield.",
    { manaCost: '{2}{R}', colors: ['R'] },
  );

  test('the creature is shuffled in, and the owner puts the top creature card onto the battlefield', () => {
    const g = scenario()
      .seat(0)
      .define(warp)
      .library(BOLT)
      .hand(warp.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(BEARS, BEARS, BEARS)
      .battlefield(ANGEL)
      .build();
    g.act(0).cast(warp.name, { targets: [{ name: ANGEL, seat: 1 }], pay: true });
    g.passAll();
    // The library had 3 cards and the Angel is the 4th; one of them came out as a creature of the owner's.
    g.expect.librarySize(1, 3);
    const theirs = g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 1);
    expect(theirs).toHaveLength(1);
    g.expect.invariants();
  });
});

// ---- An additional combat phase

describe('"Whenever ~ attacks, you may pay {2}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase." (CR 500.8, 506.4)', () => {
  const wyrm = parsed(
    'SYNTHETIC Parsed Charge Wyrm',
    'Creature — Dragon',
    'Flying, haste\nWhenever ~ attacks, you may pay {2}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.',
    { manaCost: '{3}{R}{R}', power: '4', toughness: '4', colors: ['R'] },
  );
  const COMBAT = [
    'beginningOfCombat',
    'declareAttackers',
    'declareBlockers',
    'firstStrikeDamage',
    'combatDamage',
    'endOfCombat',
  ];
  const finishCombat = (g: ReturnType<typeof attack>) => {
    for (let i = 0; i < 8 && g.state.pending?.kind === 'priority'; i += 1) {
      if (!COMBAT.includes(g.state.turn.step)) return;
      g.passAll();
    }
  };
  function attack() {
    const g = scenario()
      .seat(0)
      .define(wyrm)
      .library(...FILLER)
      .battlefield(wyrm.name, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  test('I pay, the Wyrm untaps and a second combat phase follows', () => {
    const g = attack();
    g.act(0).attack([wyrm.name]);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    finishCombat(g);
    g.expect.life(1, 36);
    g.expect.tapped(wyrm.name, false);
    expect(g.state.turn.step).toBe('declareAttackers');
    g.expect.pending('declareAttackers', 0);
  });

  test('declining the payment: no additional phase, the Wyrm stays tapped', () => {
    const g = attack();
    g.act(0).attack([wyrm.name]);
    g.passAll();
    g.act(0).decline();
    g.passAll();
    finishCombat(g);
    g.expect.life(1, 36);
    g.expect.tapped(wyrm.name, true);
    expect(g.state.turn.step).toBe('postcombatMain');
  });
});

// ---- Dethrone

describe('"Dethrone" (CR 702.105a)', () => {
  const usurper = parsed('SYNTHETIC Parsed Usurper', 'Creature — Dragon', 'Dethrone', {
    manaCost: '{1}{R}',
    power: '2',
    toughness: '2',
    colors: ['R'],
  });

  test('the player attacked has the most life (tied): a +1/+1 counter', () => {
    const g = scenario()
      .seat(0)
      .define(usurper)
      .library(...FILLER)
      .battlefield(usurper.name)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([usurper.name]);
    g.passAll();
    g.expect.counters(usurper.name, { '+1/+1': 1 });
  });

  test('the player attacked has less life than I do: no counter', () => {
    const g = scenario()
      .seat(0)
      .define(usurper)
      .library(...FILLER)
      .battlefield(usurper.name)
      .seat(1)
      .library(...FILLER)
      .life(20)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([usurper.name]);
    g.passAll();
    g.expect.counters(usurper.name, {});
  });
});

// ---- Pay any amount

describe('"When ~ dies, you may pay any amount of {R}. When you do, it deals that much damage to any target." (CR 118.1, 603.12)', () => {
  const tyrant = parsed(
    'SYNTHETIC Parsed Tyrant',
    'Creature — Dragon',
    'When ~ dies, you may pay any amount of {R}. When you do, it deals that much damage to any target.',
    { manaCost: '{2}{R}', power: '2', toughness: '5', colors: ['R'] },
  );

  function dying(extra: number) {
    let b = scenario()
      .seat(0)
      .define(tyrant)
      .library(...FILLER)
      .battlefield(tyrant.name)
      .hand(BOLT, BOLT);
    for (let i = 0; i < 2 + extra; i += 1) b = b.battlefield('Mountain');
    const g = b
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [tyrant.name], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [tyrant.name], pay: true });
    g.passAll();
    return g;
  }

  test('I am asked how many, from 0 to the {R} I could pay', () => {
    const g = dying(3);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect(d.purpose).toBe('payAnyAmount');
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
  });

  test('3: the reflexive ability deals 3 damage to a player', () => {
    const g = dying(3);
    g.act(0).chooseX(3);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('0: nothing is paid and nothing happens', () => {
    const g = dying(3);
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.life(1, 40);
  });
});

// ---- Put onto the battlefield tapped and attacking

describe('"... you may put a Dragon creature card from your hand onto the battlefield tapped and attacking." (CR 508.4)', () => {
  const kobold = parsed(
    'SYNTHETIC Parsed Kobold',
    'Creature — Kobold',
    'Menace\nWhenever ~ attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.',
    { manaCost: '{R}', power: '0', toughness: '1', colors: ['R'] },
  );

  test('the line reads, and with too little power the trigger does nothing', () => {
    const g = scenario()
      .seat(0)
      .define(kobold)
      .library(...FILLER)
      .battlefield(kobold.name)
      .hand(ANGEL)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([kobold.name]);
    g.passAll();
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
  });
});

describe('Pack Kobold with enough power: the Dragon enters attacking, without an attack trigger of its own (CR 508.4)', () => {
  const kobold = parsed(
    'SYNTHETIC Parsed Pack Kobold',
    'Creature — Kobold',
    'Menace\nWhenever ~ attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.',
    { manaCost: '{R}', power: '0', toughness: '1', colors: ['R'] },
  );
  const big = parsed('SYNTHETIC Parsed Big Bear', 'Creature — Bear', 'Vigilance', {
    manaCost: '{4}{G}',
    power: '6',
    toughness: '6',
    colors: ['G'],
  });
  const dragon = parsed('SYNTHETIC Parsed Hand Dragon', 'Creature — Dragon', 'Flying', {
    manaCost: '{3}{R}',
    power: '3',
    toughness: '3',
    colors: ['R'],
  });

  test('the Dragon from my hand enters tapped and attacking', () => {
    const g = scenario()
      .seat(0)
      .define(kobold)
      .define(big)
      .define(dragon)
      .library(...FILLER)
      .battlefield(kobold.name, big.name)
      .hand(dragon.name)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([kobold.name, big.name]);
    g.passAll();
    // "you may": asked, and accepting puts the Dragon onto the battlefield.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(dragon.name, 'battlefield', { seat: 0 });
    g.expect.tapped(dragon.name, true);
  });
});

// ---- What must not be read

describe('lines the grammar does not read stay unsupported (never half-executed)', () => {
  test.each([
    ['Exile the top two cards of your library. You may play them.', 'Sorcery'],
    ['You may play that card this turn.', 'Sorcery'],
    ['Add three mana in any combination of colors.', 'Sorcery'],
  ])('%s', (text, typeLine) => {
    const name = 'SYNTHETIC Parsed Unread';
    const imported = parseOnly(
      syntheticCard({ name, typeLine, oracleText: text, manaCost: '{R}' }),
    );
    expect(imported.support.status).not.toBe('supported');
  });
});
