// The Exit from Exile precon (issue 168), read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
// (the name replaced by ~), run through `applyAction` with the scenario DSL.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp', 'Island'] as const;

describe('"Whenever you cast a spell from exile, ..." (CR 601.2a, 601.2i, 406.1)', () => {
  const watcher = parsed(
    'SYNTHETIC Exile Watcher',
    'Creature — Elf Advisor',
    'Whenever you cast a spell from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = () =>
    scenario()
      .define(watcher)
      .seat(0)
      .life(20)
      .hand('Grizzly Bears')
      .battlefield(watcher.name, 'Forest', 'Forest')
      .library('Grizzly Bears', ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell cast from exile triggers it', () => {
    const g = build();
    g.act(0).activate(watcher.name, { ability: 1 });
    g.passAll();
    g.act(0).chooseCards('Grizzly Bears');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(watcher.name, { ability: 2 });
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a spell cast from the hand does not', () => {
    const g = build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
  });
});

describe('"Whenever you cast a spell from exile or a land you control enters from exile, ..." (CR 603.2c, 603.6a, 400.7)', () => {
  const lander = parsed(
    'SYNTHETIC Exile Lander',
    'Creature — Elf Advisor',
    'Whenever you cast a spell from exile or a land you control enters from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = (top: string) =>
    scenario()
      .define(lander)
      .seat(0)
      .life(20)
      .hand('Forest')
      .battlefield(lander.name, 'Forest', 'Forest')
      .library(top, ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const exiled = (top: string) => {
    const g = build(top);
    g.act(0).activate(lander.name, { ability: 2 });
    g.passAll();
    g.act(0).chooseCards(top);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(lander.name, { ability: 3 });
    g.passAll();
    return g;
  };

  test('a land played from exile triggers it once', () => {
    const g = exiled('Forest');
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a spell cast from exile triggers it once', () => {
    const g = exiled('Grizzly Bears');
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a land played from the hand does not', () => {
    const g = build('Grizzly Bears');
    g.act(0).playLand('Forest');
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
  });
});

describe('"Exile the top two cards of your library. You may play cards exiled this way until the end of your next turn." (CR 701.13, 601.2, 305.1, 611.2a)', () => {
  const wilds = parsed(
    'SYNTHETIC Wilds Escape',
    'Sorcery',
    'Exile the top two cards of your library. You may play cards exiled this way until the end of your next turn.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const build = () =>
    scenario()
      .define(wilds)
      .seat(0)
      .hand(wilds.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library('Grizzly Bears', 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the cards are exiled and can be played this turn', () => {
    const g = build();
    g.act(0).cast(wilds.name, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile');
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('the permission is still there in the next turn of the controller', () => {
    const g = build();
    g.act(0).cast(wilds.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

describe('"~ deals 2 damage to each opponent and each creature they control. If ~ was cast from exile, it deals 5 damage ... instead." (CR 120.2, 601.2a, 614.1a)', () => {
  const blast = parsed(
    'SYNTHETIC Delayed Blast',
    'Sorcery',
    '~ deals 2 damage to each opponent and each creature they control. If ~ was cast from exile, it deals 5 damage to each opponent and each creature they control instead.',
    { manaCost: '{4}{R}{R}', colors: ['R'] },
  );
  const keeper = parsed(
    'SYNTHETIC Exile Keeper',
    'Creature — Elf Advisor',
    'Draw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = (top: string | null) =>
    scenario()
      .define(blast)
      .define(keeper)
      .seat(0)
      .hand(...(top === null ? [blast.name] : []))
      .battlefield(
        keeper.name,
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .library(top ?? 'Island', ...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('cast from the hand: 2 to the opponent and to each of their creatures', () => {
    const g = build(null);
    g.act(0).cast(blast.name, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(18);
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
  });

  test('cast from exile: 5 damage instead', () => {
    const g = build(blast.name);
    g.act(0).activate(keeper.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseCards(blast.name);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(keeper.name, { ability: 1 });
    g.passAll();
    g.act(0).cast({ name: blast.name, zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(15);
    g.expect.noObject('Serra Angel', { zone: 'battlefield' });
  });
});

describe('"... you may cast spells from among those exiled cards this turn" and "... without paying its mana cost" (CR 601.2, 118.9, 305.1)', () => {
  const among = parsed(
    'SYNTHETIC Among Spells',
    'Sorcery',
    'Exile the top two cards of your library. You may cast spells from among those exiled cards this turn.',
    { manaCost: '{1}', colors: [] },
  );
  const free = parsed(
    'SYNTHETIC Free Play',
    'Sorcery',
    'Exile the top card of your library. You may play it this turn without paying its mana cost.',
    { manaCost: '{1}', colors: [] },
  );
  const build = (spell: string, ...top: string[]) =>
    scenario()
      .define(among)
      .define(free)
      .seat(0)
      .hand(spell)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell among the exiled cards can be cast, a land among them stays exiled', () => {
    const g = build(among.name, 'Forest', 'Grizzly Bears');
    g.act(0).cast(among.name, { pay: true });
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'exile');
  });

  test('without paying its mana cost: the spell is cast for no mana', () => {
    const g = build(free.name, 'Grizzly Bears');
    g.act(0).cast(free.name, { pay: true });
    g.passAll();
    const untappedBefore = Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && o.tapped !== true,
    ).length;
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { alternative: 'free' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    const untappedAfter = Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && o.tapped !== true,
    ).length;
    expect(untappedAfter).toBe(untappedBefore + 1);
  });
});

describe('"Whenever ~ deals combat damage to a player, exile that many cards from the top of your library. Until end of turn, you may cast spells from among those exiled cards." (CR 510.2, 701.13, 601.2)', () => {
  const pillager = parsed(
    'SYNTHETIC Dream Raider',
    'Creature — Human Pirate',
    'Whenever ~ deals combat damage to a player, exile that many cards from the top of your library. Until end of turn, you may cast spells from among those exiled cards.',
    { manaCost: '{1}{R}', power: '2', toughness: '2', colors: ['R'] },
  );
  const build = () =>
    scenario()
      .define(pillager)
      .seat(0)
      .battlefield(pillager.name, 'Forest', 'Forest')
      .library('Grizzly Bears', 'Island', 'Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('as many cards as the damage dealt are exiled, and a spell among them can be cast this turn', () => {
    const g = build();
    g.playCombat({ attack: [pillager.name], until: 'combatDamage' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Island', 'exile', { seat: 0 });
    g.expect.zone('Plains', 'library', { seat: 0 });
    g.advanceTo('postcombatMain');
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

describe('"At the beginning of your upkeep, exile the top card of each opponent\'s library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells." (CR 701.13, 601.2, 609.4b)', () => {
  const strategy = parsed(
    'SYNTHETIC Stolen Plan',
    'Enchantment',
    "At the beginning of your upkeep, exile the top card of each opponent's library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells.",
    { manaCost: '{2}{R}', colors: ['R'] },
  );
  const build = () =>
    scenario()
      .define(strategy)
      .seat(0)
      .battlefield(strategy.name, 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library('Grizzly Bears', ...FILLER)
      .at('end', { active: 1 })
      .build();

  test("the top card of the opponent's library is exiled and can be cast with any color of mana", () => {
    const g = build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 1 });
    g.advanceTo('precombatMain');
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile', seat: 1 }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

describe('"~ can\'t attack unless you control a 1/1 creature." (CR 508.1a, 101.2, 208.1)', () => {
  const beast = parsed(
    'SYNTHETIC Lonely Beast',
    'Creature — Beast',
    "~ can't attack unless you control a 1/1 creature.",
    { manaCost: '{2}{G}', power: '5', toughness: '5', colors: ['G'] },
  );
  const tiny = parsed('SYNTHETIC Tiny One', 'Creature — Elf', '', {
    manaCost: '{G}',
    power: '1',
    toughness: '1',
    colors: ['G'],
  });
  const build = (...others: string[]) =>
    scenario()
      .define(beast)
      .define(tiny)
      .seat(0)
      .battlefield(beast.name, ...others)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('it attacks while you control a 1/1 creature', () => {
    const g = build(tiny.name);
    const before = g.state.seats[1]?.life ?? 0;
    g.playCombat({ attack: [beast.name], until: 'combatDamage' });
    expect(g.state.seats[1]?.life).toBe(before - 5);
  });

  test('with no 1/1 creature it cannot attack', () => {
    const g = build('Grizzly Bears');
    expect(() => g.playCombat({ attack: [beast.name], until: 'combatDamage' })).toThrow();
  });
});

describe('"When ~ enters, put three +1/+1 counters on each of any number of target creatures that entered this turn." (CR 115.1, 601.2d, 122.1, 400.7)', () => {
  const recluse = parsed(
    'SYNTHETIC Sweet Recluse',
    'Creature — Spider',
    'When ~ enters, put three +1/+1 counters on each of any number of target creatures that entered this turn.',
    { manaCost: '{2}{G}', power: '2', toughness: '2', colors: ['G'] },
  );
  const build = () =>
    scenario()
      .define(recluse)
      .seat(0)
      .hand('Grizzly Bears', recluse.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Serra Angel')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature that entered this turn gets the counters', () => {
    const g = build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.act(0).cast(recluse.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    expect(g.object('Grizzly Bears').counters?.['+1/+1']).toBe(3);
  });

  test('a creature that was already on the battlefield is not a legal target', () => {
    const g = build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.act(0).cast(recluse.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets('Serra Angel')).toThrow();
  });
});

describe('"Until your next turn, up to one target creature gains reach and vigilance." (CR 611.2a, 613.1f, 500.1)', () => {
  const gift = parsed(
    'SYNTHETIC Wilds Gift',
    'Instant',
    'Until your next turn, up to one target creature gains reach and vigilance.',
    { manaCost: '{G}', colors: ['G'] },
  );
  const build = () =>
    scenario()
      .define(gift)
      .seat(0)
      .hand(gift.name)
      .battlefield('Forest', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature has reach and vigilance now and keeps them through the opponent’s turn', () => {
    const g = build();
    g.act(0).cast(gift.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears', { keywords: ['reach', 'vigilance'] });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived('Grizzly Bears', { keywords: ['reach', 'vigilance'] });
  });

  test('they are gone once the controller’s next turn begins', () => {
    const g = build();
    g.act(0).cast(gift.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived('Grizzly Bears', { keywords: [] });
  });
});

describe('"Whenever you cast a spell with cascade, return this card from your graveyard to your hand." (CR 601.2i, 702.85a, 113.6k)', () => {
  const phoenix = parsed(
    'SYNTHETIC Cascade Phoenix',
    'Creature — Phoenix',
    'Flying\nWhenever you cast a spell with cascade, return this card from your graveyard to your hand.',
    { manaCost: '{3}{R}{R}', power: '4', toughness: '4', colors: ['R'] },
  );
  const cascader = parsed('SYNTHETIC Cascader', 'Sorcery', 'Cascade\nYou gain 1 life.', {
    manaCost: '{1}',
    colors: [],
  });
  const plain = parsed('SYNTHETIC Plain Spell', 'Sorcery', 'You gain 1 life.', {
    manaCost: '{1}',
    colors: [],
  });
  const build = (spell: string) =>
    scenario()
      .define(phoenix)
      .define(cascader)
      .define(plain)
      .seat(0)
      .hand(spell)
      .graveyard(phoenix.name)
      .battlefield('Island')
      .library(...FILLER, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('casting a spell with cascade returns it from the graveyard', () => {
    const g = build(cascader.name);
    g.act(0).cast(cascader.name, { pay: true });
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone(phoenix.name, 'hand', { seat: 0 });
  });

  test('casting a spell without cascade does not', () => {
    const g = build(plain.name);
    g.act(0).cast(plain.name, { pay: true });
    g.passAll();
    g.expect.zone(phoenix.name, 'graveyard', { seat: 0 });
  });
});

describe('"Damage can\'t be prevented this turn. ~ deals 2 damage to any target." (CR 615.12, 611.2a)', () => {
  const stomp = parsed(
    'SYNTHETIC Stomp Test',
    'Instant',
    "Damage can't be prevented this turn. ~ deals 2 damage to any target.",
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const bolt = parsed('SYNTHETIC Plain Bolt', 'Instant', '~ deals 2 damage to any target.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const ward = parsed(
    'SYNTHETIC Shield Spell',
    'Instant',
    'Prevent all damage that would be dealt to target creature this turn.',
    { manaCost: '{W}', colors: ['W'] },
  );
  const build = (burn: string) =>
    scenario()
      .define(stomp)
      .define(bolt)
      .define(ward)
      .seat(0)
      .hand(ward.name, burn)
      .battlefield('Mountain', 'Mountain', 'Plains', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a prevention shield stops an ordinary spell', () => {
    const g = build(bolt.name);
    g.act(0).cast(ward.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast(bolt.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  test('after the effect the same shield prevents nothing', () => {
    const g = build(stomp.name);
    g.act(0).cast(ward.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast(stomp.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe('"Whenever ~ becomes the target of a spell, ~ deals 2 damage to that spell\'s controller." (CR 603.2, 115.1, 109.4)', () => {
  const giant = parsed(
    'SYNTHETIC Spiteful Giant',
    'Creature — Giant',
    "Whenever ~ becomes the target of a spell, ~ deals 2 damage to that spell's controller.",
    { manaCost: '{2}{R}', power: '4', toughness: '3', colors: ['R'] },
  );
  const shock = parsed('SYNTHETIC Weak Shock', 'Instant', '~ deals 1 damage to any target.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const build = () =>
    scenario()
      .define(giant)
      .define(shock)
      .seat(0)
      .battlefield(giant.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(shock.name)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('the player who cast the spell takes 2 damage', () => {
    const g = build();
    g.act(1).cast(shock.name, { targets: [giant.name], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(18);
  });
});

describe('"When ~ enters, counter target activated or triggered ability from an artifact or enchantment source. If a permanent\'s ability is countered this way, destroy that permanent." (CR 701.6a, 701.8, 113.7a)', () => {
  const slime = parsed(
    'SYNTHETIC Ability Slime',
    'Creature — Ooze',
    "Flash\nWhen ~ enters, counter target activated or triggered ability from an artifact or enchantment source. If a permanent's ability is countered this way, destroy that permanent.",
    { manaCost: '{1}{U}', power: '2', toughness: '2', colors: ['U'] },
  );
  const idol = parsed('SYNTHETIC Life Idol', 'Artifact', '{1}: You gain 3 life.', {
    manaCost: '{1}',
    colors: [],
  });
  const pinger = parsed('SYNTHETIC Life Elf', 'Creature — Elf', '{1}: You gain 3 life.', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
    colors: [],
  });
  const build = (source: string) =>
    scenario()
      .define(slime)
      .define(idol)
      .define(pinger)
      .seat(0)
      .life(20)
      .battlefield(source, 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(slime.name)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('an ability of an artifact is countered and the artifact is destroyed', () => {
    const g = build(idol.name);
    g.act(0).activate(idol.name, { pay: true });
    g.pass(0);
    g.act(1).cast(slime.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
    g.expect.zone(idol.name, 'graveyard', { seat: 0 });
  });

  test('an ability of a creature is not a legal target: it resolves', () => {
    const g = build(pinger.name);
    g.act(0).activate(pinger.name, { pay: true });
    g.pass(0);
    g.act(1).cast(slime.name, { pay: true });
    g.passAll();
    // No legal target: the trigger is removed, the ability resolves and the elf stays.
    expect(g.state.seats[0]?.life).toBe(23);
    g.expect.zone(pinger.name, 'battlefield', { seat: 0 });
  });
});

describe('"Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card." (CR 608.2d, 701.13, 611.2a)', () => {
  const pick = parsed(
    'SYNTHETIC Pick One',
    'Sorcery',
    'Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card.',
    { manaCost: '{1}', colors: [] },
  );
  const build = () =>
    scenario()
      .define(pick)
      .seat(0)
      .hand(pick.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Grizzly Bears', 'Serra Angel', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('only the chosen card can be played; the other stays in exile', () => {
    const g = build();
    g.act(0).cast(pick.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Grizzly Bears');
    g.expect.zone('Serra Angel', 'exile', { seat: 0 });
    expect(() => g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { pay: true })).toThrow();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

describe('"Whenever ~ attacks or becomes the target of a spell an opponent controls, choose one — ..." (CR 508.1, 603.2, 700.2)', () => {
  const giant = parsed(
    'SYNTHETIC Quake Giant',
    'Creature — Giant',
    'Whenever ~ attacks or becomes the target of a spell an opponent controls, choose one —\n• ~ deals 3 damage to each opponent.\n• Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card.',
    { manaCost: '{3}{R}', power: '4', toughness: '4', colors: ['R'] },
  );
  const shock = parsed('SYNTHETIC Poke Spell', 'Instant', '~ deals 1 damage to any target.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const build = (active: 0 | 1) =>
    scenario()
      .define(giant)
      .define(shock)
      .seat(0)
      .battlefield(giant.name)
      .library('Grizzly Bears', 'Serra Angel', ...FILLER)
      .seat(1)
      .life(20)
      .hand(shock.name)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active })
      .build();

  test('attacking: the first mode deals 3 damage to each opponent', () => {
    const g = build(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack(giant.name);
    g.act(0).chooseModes(0);
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(17);
  });

  test('an opponent’s spell that targets it triggers it too', () => {
    const g = build(1);
    g.act(1).cast(shock.name, { targets: [giant.name], pay: true });
    g.act(0).chooseModes(0);
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(17);
  });
});

describe('"The first spell you cast from exile each turn has cascade." (CR 702.85a, 601.2i, 613.1f)', () => {
  const sorcerer = parsed(
    'SYNTHETIC Wild Sorcerer',
    'Creature — Human Wizard',
    'The first spell you cast from exile each turn has cascade.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{2}{R}', power: '2', toughness: '2', colors: ['R'] },
  );
  const build = (withSorcerer: boolean) =>
    scenario()
      .define(sorcerer)
      .seat(0)
      .hand('Serra Angel')
      .battlefield(
        ...(withSorcerer ? [sorcerer.name] : ['Island']),
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
      )
      .library('Serra Angel', 'Grizzly Bears', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell cast from exile cascades into a cheaper card', () => {
    const g = build(true);
    g.act(0).activate(sorcerer.name, { ability: 1 });
    g.passAll();
    g.act(0).chooseCards('Serra Angel');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(sorcerer.name, { ability: 2 });
    g.passAll();
    g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { pay: true });
    // The cascade trigger is above the spell on the stack: the cheaper card is exiled as it resolves.
    g.passAll();
    expect(g.find({ name: 'Grizzly Bears', zone: 'library', seat: 0 })).toHaveLength(0);
  });

  test('a spell cast from the hand does not cascade', () => {
    const g = build(true);
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    expect(g.find({ name: 'Grizzly Bears', zone: 'library', seat: 0 })).toHaveLength(1);
  });
});

describe('"Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from exile." (CR 118.9, 601.2a, 601.2b)', () => {
  const hunter = parsed(
    'SYNTHETIC Zero Hunter',
    'Creature — Lizard',
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from exile.',
    { manaCost: '{R}', power: '1', toughness: '1', colors: ['R'] },
  );
  const impulse = parsed(
    'SYNTHETIC Plain Impulse',
    'Sorcery',
    'Exile the top two cards of your library. You may play cards exiled this way this turn.',
    { manaCost: '{R}', colors: ['R'] },
  );
  const build = (withHunter: boolean) =>
    scenario()
      .define(hunter)
      .define(impulse)
      .seat(0)
      .hand(impulse.name)
      .battlefield(...(withHunter ? [hunter.name] : []), 'Mountain')
      .library('Serra Angel', 'Grizzly Bears', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature spell is cast from exile for {0}: no mana is needed', () => {
    const g = build(true);
    g.act(0).cast(impulse.name, { pay: true });
    g.passAll();
    g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { alternative: 'energyGrant' });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
  });

  test('only once each turn: the second creature spell from exile is not offered it', () => {
    const g = build(true);
    g.act(0).cast(impulse.name, { pay: true });
    g.passAll();
    g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { alternative: 'energyGrant' });
    g.passAll();
    expect(() =>
      g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { alternative: 'energyGrant' }),
    ).toThrow();
  });

  test('without the permanent the same cast cannot be paid', () => {
    const g = build(false);
    g.act(0).cast(impulse.name, { pay: true });
    g.passAll();
    expect(() =>
      g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { alternative: 'energyGrant' }),
    ).toThrow();
  });
});

describe('Journey to the Lost City: exile four, roll a d20 and read the results table (CR 706.3, 607.2a, 608.2c)', () => {
  const journey = parsed(
    'SYNTHETIC Lost Journey',
    'Enchantment',
    'At the beginning of your upkeep, exile the top four cards of your library, then roll a d20.\n1—9 | You may put a land card from among those cards onto the battlefield.\n10—19 | Create a 2/2 green Wolf creature token, then put a +1/+1 counter on it for each creature card among those cards.\n20 | Put all permanent cards exiled with ~ onto the battlefield, then sacrifice it.',
    { manaCost: '{3}{G}', colors: ['G'] },
  );
  const play = (seed: number) => {
    const g = scenario()
      .seed(seed)
      .define(journey)
      .seat(0)
      .battlefield(journey.name)
      .library('Forest', 'Grizzly Bears', 'Serra Angel', 'Lightning Bolt', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    const result = g.events.flatMap((e) => (e.kind === 'dieRolled' ? [e.result] : []))[0];
    return { g, result };
  };

  test('every row of the table does what it says, for the seeds that roll it', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200 && seen.size < 3; seed += 1) {
      const { g, result } = play(seed);
      if (result === undefined) throw new Error('no die was rolled');
      if (result <= 9 && !seen.has('land')) {
        seen.add('land');
        // The land card is put onto the battlefield by choice; the rest stay exiled.
        g.act(0).chooseCards('Forest');
        g.expect.zone('Forest', 'battlefield', { seat: 0 });
        g.expect.zone('Serra Angel', 'exile', { seat: 0 });
      } else if (result >= 10 && result <= 19 && !seen.has('wolf')) {
        seen.add('wolf');
        // Two creature cards among the four: the Wolf has two +1/+1 counters.
        const wolf = Object.values(g.state.objects).find(
          (o) => o.zone === 'battlefield' && o.token !== null,
        );
        expect(wolf?.counters?.['+1/+1']).toBe(2);
      } else if (result === 20 && !seen.has('all')) {
        seen.add('all');
        g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
        g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
        g.expect.zone('Forest', 'battlefield', { seat: 0 });
        g.expect.zone('Lightning Bolt', 'exile', { seat: 0 });
        g.expect.zone(journey.name, 'graveyard', { seat: 0 });
      }
    }
    expect([...seen].sort()).toEqual(['all', 'land', 'wolf']);
  });
});

describe('"−6: Exile the top seven cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield." (CR 608.2d, 110.2a, 606.4)', () => {
  const walker = parsed(
    'SYNTHETIC Wild Walker',
    'Legendary Planeswalker — Test',
    '−6: Exile the top seven cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield.',
    { manaCost: '{4}{R}{G}', colors: ['R', 'G'], loyalty: '6' },
  );
  const build = () =>
    scenario()
      .define(walker)
      .seat(0)
      .battlefield(walker.name)
      .library('Forest', 'Grizzly Bears', 'Serra Angel', 'Lightning Bolt', 'Island', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('any number of the creature and land cards enter; the spell and the cards not chosen stay exiled', () => {
    const g = build();
    g.act(0).activate(walker.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseCards('Forest', 'Grizzly Bears', 'Serra Angel');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 0 });
    g.expect.zone('Island', 'exile', { seat: 0 });
  });

  test('none is a legal answer', () => {
    const g = build();
    g.act(0).activate(walker.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
  });
});

describe('"+1: Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control." (CR 106.1b, 608.2d, 107.3c)', () => {
  const walker = parsed(
    'SYNTHETIC Combo Walker',
    'Legendary Planeswalker — Test',
    '+1: Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control.',
    { manaCost: '{4}{R}{G}', colors: ['R', 'G'], loyalty: '4' },
  );
  const build = () =>
    scenario()
      .define(walker)
      .seat(0)
      .battlefield(walker.name, 'Grizzly Bears', 'Grizzly Bears', 'Serra Angel')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the player chooses how many are red; the rest are green', () => {
    const g = build();
    g.act(0).activate(walker.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseX(2);
    g.expect.pool(0, 'RRG');
  });

  test('all of one color is a legal combination', () => {
    const g = build();
    g.act(0).activate(walker.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseX(0);
    g.expect.pool(0, 'GGG');
  });

  test('with no creature nothing is asked and nothing is added', () => {
    const g = scenario()
      .define(walker)
      .seat(0)
      .battlefield(walker.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(walker.name, { ability: 0 });
    g.passAll();
    g.expect.pool(0, '');
  });
});

describe('"{4}, {T}: Target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren\'t cast this way on the bottom of that library in a random order." (CR 701.13, 608.2g, 401.4)', () => {
  const wand = parsed(
    'SYNTHETIC Chaos Staff',
    'Artifact',
    "{4}, {T}: Target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order.",
    { manaCost: '{3}', colors: [] },
  );
  const build = () =>
    scenario()
      .define(wand)
      .seat(0)
      .life(20)
      .battlefield(wand.name, 'Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library('Forest', 'Grizzly Bears', 'Lightning Bolt', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the first instant or sorcery is cast for free by the wand’s controller; the other exiled cards go to the bottom', () => {
    const g = build();
    g.act(0).activate(wand.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'exile', seat: 1 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(g.state.seats[1]?.life).toBeLessThan(20);
    g.expect.noObject('Forest', { zone: 'exile' });
    g.expect.noObject('Grizzly Bears', { zone: 'exile' });
  });
});

describe('"Exile the top three cards of your library. Until the end of your next turn, you may play those cards. If ~ was cast from a graveyard, you may play cards this way without paying their mana costs." (CR 118.9, 601.2a, 611.2a)', () => {
  const ignite = parsed(
    'SYNTHETIC Ignite Test',
    'Sorcery',
    'Exile the top three cards of your library. Until the end of your next turn, you may play those cards. If ~ was cast from a graveyard, you may play cards this way without paying their mana costs.\nFlashback {R}',
    { manaCost: '{R}', colors: ['R'] },
  );
  const build = () =>
    scenario()
      .define(ignite)
      .seat(0)
      .battlefield('Mountain')
      .library('Serra Angel', 'Grizzly Bears', 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 });
  const game = (zone: 'hand' | 'graveyard') => {
    const b = build();
    const g = (
      zone === 'hand' ? b.seat(0).hand(ignite.name) : b.seat(0).graveyard(ignite.name)
    ).build();
    return g;
  };

  test('cast from the hand: the exiled cards must be paid for', () => {
    const g = game('hand');
    g.act(0).cast(ignite.name, { pay: true });
    g.passAll();
    expect(() =>
      g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { alternative: 'free' }),
    ).toThrow();
  });

  test('cast from the graveyard: they can be played without paying their mana costs', () => {
    const g = game('graveyard');
    g.act(0).cast(ignite.name, { alternative: 'flashback', pay: true });
    g.passAll();
    g.act(0).cast({ name: 'Serra Angel', zone: 'exile' }, { alternative: 'free' });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
  });
});

describe('"{1}{R}, {T}, Sacrifice ~: Cast any number of cards exiled with ~ without paying their mana costs." (CR 607.2a, 608.2g, 118.9)', () => {
  const chemist = parsed(
    'SYNTHETIC Izzet Test Goblin',
    'Creature — Goblin Wizard',
    'Haste\n{R}, {T}: Exile target instant or sorcery card from your graveyard.\n{1}{R}, {T}, Sacrifice ~: Cast any number of cards exiled with ~ without paying their mana costs.',
    { manaCost: '{2}{R}', power: '2', toughness: '2', colors: ['R'] },
  );
  const build = () =>
    scenario()
      .define(chemist)
      .seat(0)
      .battlefield(chemist.name, 'Mountain', 'Mountain', 'Mountain')
      .graveyard('Lightning Bolt')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card it exiled is cast for free when it is sacrificed', () => {
    const g = build();
    g.act(0).activate(chemist.name, { ability: 1, targets: ['Lightning Bolt'], pay: true });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'exile', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(chemist.name, { ability: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards('Lightning Bolt');
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(17);
    g.expect.zone(chemist.name, 'graveyard', { seat: 0 });
  });
});
