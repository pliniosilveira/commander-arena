// The cards of issue 160 (the Token Triumph precon), run as written (D-609 and the following entries). Each group imports SYNTHETIC cards through the grammar (never through a
// fixture), defines them in an engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card
// the issue names, taken from the card data of the issue's comment. No real card's text is claimed beyond that.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;

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
    .at('precombatMain', { active: 0 })
    .build();
}

const tokens = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

// ---- Group 1: "Tap an untapped creature you control" next to mana and in a mana ability (D-609).

const EVANGEL = parsed(
  'SYNTHETIC Parsed Evangel',
  'Creature — Elf Shaman',
  '{1}, {T}, Tap an untapped creature you control: Create a 1/1 green Saproling creature token.',
  { manaCost: '{1}{G}', colors: ['G'], power: '1', toughness: '1' },
);
const SENTINEL = parsed(
  'SYNTHETIC Parsed Sentinel',
  'Creature — Elf Scout',
  'Reach\n{T}, Tap an untapped creature you control: Add one mana of any color.',
  { manaCost: '{1}{G}', colors: ['G'], power: '1', toughness: '2' },
);
const SETTLEMENT = parsed(
  'SYNTHETIC Parsed Settlement',
  'Land',
  '{T}: Add {C}.\n{T}, Tap an untapped creature you control: Add one mana of any color.',
);

describe('"Tap an untapped creature you control" in the cost of an ability (D-609)', () => {
  test('{1}, {T} and a creature: the creature is tapped first, the mana is paid, a Saproling is made', () => {
    const g = main((b) =>
      b.define(EVANGEL).battlefield(EVANGEL.name).battlefield(BEARS).battlefield('Forest'),
    );
    g.act(0).activate(EVANGEL.name);
    g.expect.tapped(EVANGEL.name, true);
    g.expect.tapped(BEARS, true);
    g.act(0).payAuto();
    g.passAll();
    expect(tokens(g, 'Saproling')).toHaveLength(1);
    g.expect.invariants();
  });

  test('the creature tapped for the cost cannot be tapped for the mana as well', () => {
    const g = main((b) =>
      b.define(EVANGEL).battlefield(EVANGEL.name).battlefield('Llanowar Elves'),
    );
    g.act(0).activate(EVANGEL.name);
    g.expect.tapped('Llanowar Elves', true);
    // Only the Elves could have paid the {1}, and they are tapped now: the player takes it back.
    expect(g.act(0).try.action({ kind: 'payAuto' }).ok).toBe(false);
  });

  test('a mana ability that taps a creature: the Sentinel taps itself and the Bears, and makes one mana of any color', () => {
    const g = main((b) => b.define(SENTINEL).battlefield(SENTINEL.name).battlefield(BEARS));
    g.act(0).tapForMana(SENTINEL.name, { color: 'B' });
    g.expect.tapped(SENTINEL.name, true);
    g.expect.tapped(BEARS, true);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['B']);
  });

  test('the land: a creature to tap, and then the land makes a color; without one it makes {C} only', () => {
    const lone = main((b) => b.define(SETTLEMENT).battlefield(SETTLEMENT.name));
    expect(() => lone.act(0).tapForMana(SETTLEMENT.name, { ability: 1, color: 'W' })).toThrow();
    lone.act(0).tapForMana(SETTLEMENT.name, { ability: 0 });
    expect(lone.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['C']);
    const g = main((b) => b.define(SETTLEMENT).battlefield(SETTLEMENT.name).battlefield(BEARS));
    g.act(0).tapForMana(SETTLEMENT.name, { ability: 1, color: 'W' });
    g.expect.tapped(SETTLEMENT.name, true);
    g.expect.tapped(BEARS, true);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['W']);
  });
});

// ---- Group 2: tokens counted by an amount, and a spell that shuffles itself into its owner's library (D-610).

const lifeGame = (life: number, ...extra: ((b: Builder) => Builder)[]) => {
  let b = scenario()
    .seat(0)
    .life(life)
    .library(...FILLER);
  for (const f of extra) b = f(b);
  return b
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
};

const CAT_RITE = parsed(
  'SYNTHETIC Parsed Cat Rite',
  'Sorcery',
  'Create X 2/2 white Cat creature tokens, where X is your life total.',
  { manaCost: '{W}', colors: ['W'] },
);
const MUTATION = parsed(
  'SYNTHETIC Parsed Mutation',
  'Sorcery',
  "Destroy target enchantment. Create X 1/1 green Saproling creature tokens, where X is that enchantment's mana value.",
  { manaCost: '{1}{G}', colors: ['G'] },
);
const ENCHANTMENT = parsed('SYNTHETIC Parsed Enchantment', 'Enchantment', '', {
  manaCost: '{2}{W}',
  colors: ['W'],
});
const ZENITH = parsed(
  'SYNTHETIC Parsed Zenith',
  'Sorcery',
  "Create X 2/2 white Cat creature tokens. Shuffle ~ into its owner's library.",
  { manaCost: '{X}{W}{W}{W}', colors: ['W'] },
);

describe('X tokens counted by what the text says (D-610)', () => {
  test('"where X is your life total": five tokens at 5 life, read as the spell resolves (CR 107.3c, 119.1)', () => {
    const g = lifeGame(5, (b) => b.define(CAT_RITE).hand(CAT_RITE.name).battlefield('Plains'));
    g.act(0).cast(CAT_RITE.name, { pay: true });
    g.passAll();
    expect(tokens(g, 'Cat')).toHaveLength(5);
    g.expect.invariants();
  });

  test('"where X is that enchantment\'s mana value": the enchantment is destroyed and its mana value counts (CR 202.3, 608.2h)', () => {
    const withTarget = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(MUTATION)
      .hand(MUTATION.name)
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .define(ENCHANTMENT)
      .battlefield(ENCHANTMENT.name)
      .at('precombatMain', { active: 0 })
      .build();
    withTarget.act(0).cast(MUTATION.name, {
      targets: [{ name: ENCHANTMENT.name, zone: 'battlefield', seat: 1 }],
      pay: true,
    });
    withTarget.passAll();
    expect(tokens(withTarget, 'Saproling')).toHaveLength(3);
    withTarget.expect.zone(ENCHANTMENT.name, 'graveyard');
  });

  test("a spell that shuffles itself into its owner's library goes to no graveyard (CR 608.2n, 701.24)", () => {
    const g = lifeGame(20, (b) =>
      b.define(ZENITH).hand(ZENITH.name).battlefield('Plains', { count: 5 }),
    );
    g.act(0).cast(ZENITH.name, { x: 2, pay: true });
    g.passAll();
    expect(tokens(g, 'Cat')).toHaveLength(2);
    g.expect.zone(ZENITH.name, 'library');
    expect(g.state.seats[0]?.graveyard ?? []).toHaveLength(0);
    g.expect.invariants();
  });
});

// ---- Group 3: damage-counted tokens and a draw for each opponent with fewer creatures (D-610).

const NEST = parsed(
  'SYNTHETIC Parsed Nest',
  'Creature — Insect',
  'Defender\nWhenever ~ is dealt damage, create that many 1/1 green Insect creature tokens with flying and deathtouch.',
  { manaCost: '{1}{G}', colors: ['G'], power: '0', toughness: '3' },
);
const READER = parsed(
  'SYNTHETIC Parsed Reader',
  'Creature — Human',
  'When ~ enters, draw a card for each opponent who controls fewer creatures than you.',
  { manaCost: '{G}', colors: ['G'], power: '1', toughness: '1' },
);

describe('damage-counted tokens and "for each opponent who controls fewer creatures" (D-610)', () => {
  test('a Nest dealt 3 damage makes 3 Insects, even when the damage kills it (CR 120.3, 603.2)', () => {
    const g = main((b) =>
      b.define(NEST).battlefield(NEST.name).hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).cast('Lightning Bolt', {
      targets: [{ name: NEST.name, zone: 'battlefield', seat: 0 }],
      pay: true,
    });
    g.passAll();
    const insects = tokens(g, 'Insect');
    expect(insects).toHaveLength(3);
    g.expect.invariants();
  });

  test('a Reader draws a card for each opponent with fewer creatures than you, and none for one with as many', () => {
    const fewer = main((b) => b.define(READER).hand(READER.name).battlefield('Forest'));
    fewer.act(0).cast(READER.name, { pay: true });
    fewer.passAll();
    // Hand: the Reader left it; one card was drawn.
    fewer.expect.handSize(0, 1);
    const equal = main(
      (b) => b.define(READER).hand(READER.name).battlefield('Forest'),
      (b) => b.battlefield(BEARS),
    );
    equal.act(0).cast(READER.name, { pay: true });
    equal.passAll();
    // The Reader makes one creature each: equal, not fewer.
    equal.expect.handSize(0, 0);
  });
});

const SLATE = parsed(
  'SYNTHETIC Parsed Slate',
  'Artifact',
  '{4}, {T}, Discard your hand: Draw a card for each creature you control.',
  { manaCost: '{3}' },
);

describe('"Discard your hand" as a cost (D-610, CR 701.9, 118.3)', () => {
  test('the whole hand goes, none chosen, and the draw counts the creatures', () => {
    const g = main((b) =>
      b
        .define(SLATE)
        .battlefield(SLATE.name)
        .battlefield('Plains', { count: 4 })
        .battlefield(BEARS, { count: 2 })
        .hand('Plains', 'Forest', 'Mountain'),
    );
    g.act(0).activate(SLATE.name, { pay: true });
    g.expect.handSize(0, 0);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('an empty hand pays it with nothing to discard', () => {
    const g = main((b) =>
      b
        .define(SLATE)
        .battlefield(SLATE.name)
        .battlefield('Plains', { count: 4 })
        .battlefield(BEARS, { count: 3 }),
    );
    g.act(0).activate(SLATE.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
  });
});

const HARVEST = parsed(
  'SYNTHETIC Parsed Harvest',
  'Sorcery',
  'Search your library for up to X basic land cards, where X is the number of tapped creatures you control, put those cards onto the battlefield tapped, then shuffle.',
  { manaCost: '{G}', colors: ['G'] },
);

describe('"Search your library for up to X ..., where X is ..." (D-610, CR 701.23, 107.3c)', () => {
  const harvest = (tappedBears: number) =>
    scenario()
      .seat(0)
      .life(20)
      .library('Forest', 'Forest', 'Forest', 'Forest', 'Plains')
      .define(HARVEST)
      .hand(HARVEST.name)
      .battlefield('Forest')
      .battlefield(BEARS, { count: Math.max(tappedBears, 1), tapped: tappedBears > 0 })
      .battlefield('Llanowar Elves')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two tapped creatures: up to two basic lands, put onto the battlefield tapped', () => {
    const g = harvest(2);
    g.act(0).cast(HARVEST.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected a search');
    expect(d.max).toBe(2);
    g.act(0).chooseCards(
      { name: 'Forest', zone: 'library', seat: 0, nth: 0 },
      { name: 'Forest', zone: 'library', seat: 0, nth: 1 },
    );
    // Two cards left the library for the battlefield, tapped.
    expect(g.state.seats[0]?.library).toHaveLength(3);
    g.expect.tapped({ name: 'Forest', zone: 'battlefield', seat: 0, nth: 1 }, true);
    g.expect.tapped({ name: 'Forest', zone: 'battlefield', seat: 0, nth: 2 }, true);
    g.expect.invariants();
  });

  test('no tapped creature: nothing may be found, and the player shuffles', () => {
    const g = harvest(0);
    g.act(0).cast(HARVEST.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });
});

// ---- Group 4: a modal landfall that grants a group, "creatures target player controls get ... Untap them", and populate (D-611).

const RETREAT = parsed(
  'SYNTHETIC Parsed Retreat',
  'Enchantment',
  'Landfall — Whenever a land you control enters, choose one —\n• Create a 2/2 white Cat Beast creature token.\n• Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.',
  { manaCost: '{4}{W}', colors: ['W'] },
);
const GUARDIAN = parsed(
  'SYNTHETIC Parsed Guardian',
  'Creature — Treefolk',
  'Flash\nReach\nWhen ~ enters, creatures target player controls get +2/+2 until end of turn. Untap them.',
  { manaCost: '{3}{G}', colors: ['G'], power: '2', toughness: '4' },
);
const DEFENSES = parsed(
  'SYNTHETIC Parsed Defenses',
  'Instant',
  'Populate. Creatures you control gain indestructible until end of turn.',
  { manaCost: '{G}{W}', colors: ['G', 'W'] },
);

describe('Felidar Retreat, Great Oak Guardian and Rootborn Defenses as written (D-611)', () => {
  test('the Retreat: a land makes a 2/2 Cat Beast, or counters and vigilance for every creature (CR 611.2c)', () => {
    const cat = main((b) => b.define(RETREAT).battlefield(RETREAT.name).hand('Forest'));
    cat.act(0).playLand('Forest');
    cat.act(0).chooseModes(0);
    cat.passAll();
    expect(tokens(cat, 'Cat Beast')).toHaveLength(1);

    const grow = main((b) =>
      b.define(RETREAT).battlefield(RETREAT.name).battlefield(BEARS, { count: 2 }).hand('Forest'),
    );
    grow.act(0).playLand('Forest');
    grow.act(0).chooseModes(1);
    grow.passAll();
    grow.expect.counters({ name: BEARS, nth: 0 }, { '+1/+1': 1 });
    grow.expect.counters({ name: BEARS, nth: 1 }, { '+1/+1': 1 });
    grow.expect.invariants();
  });

  test('the Guardian: the creatures of the player targeted get +2/+2 and untap', () => {
    const g = main(
      (b) =>
        b
          .define(GUARDIAN)
          .hand(GUARDIAN.name)
          .battlefield('Forest', { count: 4 })
          .battlefield(BEARS, { tapped: true }),
      (b) => b.battlefield(BEARS, { tapped: true }),
    );
    g.act(0).cast(GUARDIAN.name, { pay: true });
    g.passAll();
    // The trigger targets a player: seat 0 targets itself.
    const d = g.state.pending;
    if (d?.kind === 'targets') g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.tapped({ name: BEARS, seat: 0, zone: 'battlefield' }, false);
    g.expect.tapped({ name: BEARS, seat: 1, zone: 'battlefield' }, true);
    g.expect.invariants();
  });

  test('Defenses: populate copies the one creature token, and every creature gains indestructible', () => {
    // At 1 life the Cat Rite makes one Cat: the token to copy.
    const g = lifeGame(1, (b) =>
      b
        .define(DEFENSES)
        .define(CAT_RITE)
        .hand(CAT_RITE.name, DEFENSES.name)
        .battlefield('Plains', { count: 4 })
        .battlefield('Forest'),
    );
    g.act(0).cast(CAT_RITE.name, { pay: true });
    g.passAll();
    expect(tokens(g, 'Cat')).toHaveLength(1);
    g.act(0).cast(DEFENSES.name, { pay: true });
    g.passAll();
    expect(tokens(g, 'Cat')).toHaveLength(2);
    g.expect.invariants();
  });
});

// ---- Group 5: creatures with less power can't block (D-612).

const CHAMPION = parsed(
  'SYNTHETIC Parsed Champion',
  'Creature — Human Soldier',
  "Creatures with power less than ~'s power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature.",
  { manaCost: '{2}{G}', colors: ['G'], power: '3', toughness: '3' },
);

describe('"Creatures with power less than ~\'s power can\'t block creatures you control" (D-612, CR 509.1b)', () => {
  test('a creature with less power cannot block mine, one with as much power can', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .define(CHAMPION)
      .battlefield(CHAMPION.name)
      .battlefield(BEARS)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield('Raging Goblin')
      .battlefield('SYNTHETIC Elf 3/3')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([CHAMPION.name, BEARS]);
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error('expected the blockers decision');
    const can = (blocker: string, attacker: string) =>
      d.candidates.some((c) => c.blocker === g.id(blocker) && c.canBlock.includes(g.id(attacker)));
    expect(can('Raging Goblin', BEARS)).toBe(false);
    expect(can('Raging Goblin', CHAMPION.name)).toBe(false);
    expect(can('SYNTHETIC Elf 3/3', BEARS)).toBe(true);
  });
});

const PRESENCE = parsed(
  'SYNTHETIC Parsed Presence',
  'Enchantment — Aura',
  'Enchant creature\nEnchanted creature has "{T}: Create a 1/1 green Elf Warrior creature token."',
  { manaCost: '{2}{G}', colors: ['G'] },
);

describe('an Aura that gives an enchanted creature an activated ability (D-612, CR 613.1f, 303.4e)', () => {
  test('the enchanted creature taps for an Elf Warrior token; a creature without the Aura has no such ability', () => {
    const g = main((b) =>
      b
        .define(PRESENCE)
        .hand(PRESENCE.name)
        .battlefield('Forest', { count: 3 })
        .battlefield(BEARS)
        .battlefield('Llanowar Elves'),
    );
    g.act(0).cast(PRESENCE.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).activate(BEARS);
    g.passAll();
    expect(tokens(g, 'Elf Warrior')).toHaveLength(1);
    g.expect.tapped(BEARS, true);
    g.expect.invariants();
  });
});

const DISCORD = parsed(
  'SYNTHETIC Parsed Discord',
  'Creature — Angel',
  'At the beginning of your end step, each player gains control of all creatures they own.',
  { manaCost: '{3}{G}{W}', colors: ['G', 'W'], power: '4', toughness: '4' },
);

describe('"each player gains control of all creatures they own" (D-612, CR 613.1b)', () => {
  test('a stolen creature goes back to its owner at my end step', () => {
    const g = main(
      (b) => b.define(DISCORD).battlefield(DISCORD.name),
      (b) => b.battlefield(BEARS, { controller: 0, label: 'stolen' }),
    );
    const controller = (): number => {
      const obj = g.state.objects[g.id('stolen')];
      if (obj === undefined) throw new Error('gone');
      return getView(g.state, 0).battlefield.find((o) => o.id === obj.id)?.controller ?? -1;
    };
    expect(controller()).toBe(0);
    g.advanceTo('end');
    g.passAll();
    expect(controller()).toBe(1);
  });
});

// ---- Group 6: an Aura that enchants a player (D-613).

const BOUNTY = parsed(
  'SYNTHETIC Parsed Bounty',
  'Enchantment — Aura Curse',
  'Enchant player\nWhenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control.',
  { manaCost: '{2}{G}', colors: ['G'] },
);

describe('"Enchant player" and "Whenever enchanted player is attacked" as written (D-613, CR 303.4, 508.1)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(BOUNTY)
      .hand(BOUNTY.name)
      .battlefield('Forest', { count: 3 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('cast on the opponent, then attacking them untaps the attackers (a vigilance-like trigger, once for the declaration)', () => {
    const g = game();
    g.act(0).cast(BOUNTY.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.objects[g.id(BOUNTY.name)]?.attachedToPlayer).toBe(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mine']);
    g.expect.tapped('mine', true);
    g.passAll();
    g.expect.tapped('mine', false);
    g.expect.invariants();
  });

  test('without the Curse on the attacked player nothing untaps', () => {
    const g = game();
    g.act(0).cast(BOUNTY.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mine']);
    g.passAll();
    g.expect.tapped('mine', true);
  });
});
