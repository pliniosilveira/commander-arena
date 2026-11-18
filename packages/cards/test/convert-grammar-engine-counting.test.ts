// Parsed text is worth something only if the engine runs it as written. The counting phrases of issue 104 (the Zombie deck), run through applyAction: the greater of two amounts
// ("..., whichever is greater", CR 608.2c), a count of the cards in a graveyard of the player a trigger targets ("where X is the number of creature cards in target player's graveyard",
// CR 115.1, 603.3d, 608.2c) and a number of targets that an amount sets ("up to X target Zombie cards ..., where X is the number of opponents you have", CR 107.3c, 603.3d, 601.2c).
// Every card name starts with "SYNTHETIC"; the wording is that of the card named in the test title. No real card's text is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Forest', 'Plains', 'Swamp'] as const;

const zombie = parsed('SYNTHETIC Parsed Zombie', 'Creature — Zombie', 'Vigilance', {
  manaCost: '{B}',
  power: '1',
  toughness: '1',
  colors: ['B'],
});
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const augur = parsed(
  'SYNTHETIC Parsed Augur',
  'Creature — Zombie Wizard',
  'When ~ dies, you draw X cards and you lose X life, where X is the number of creature cards in target player’s graveyard.',
  { manaCost: '{3}{B}', power: '4', toughness: '2', colors: ['B'] },
);
const hulk = parsed(
  'SYNTHETIC Parsed Hulk',
  'Creature — Zombie',
  'When ~ enters, return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have.',
  { manaCost: '{B}', power: '5', toughness: '5', colors: ['B'] },
);
const prophet = parsed(
  'SYNTHETIC Parsed Prophet',
  'Creature — Zombie Wizard',
  'When ~ enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater.',
  { manaCost: '{U}', power: '3', toughness: '4', colors: ['U'] },
);

const defs = () =>
  scenario().define(zombie).define(bear).define(augur).define(hulk).define(prophet);

describe('"draw cards equal to the number of A or the number of B, whichever is greater" (CR 608.2c)', () => {
  const board = (zombiesOnBattlefield: number, zombiesInGraveyard: number) =>
    defs()
      .seat(0)
      .library(...FILLER, ...FILLER)
      .hand(prophet.name)
      .battlefield('Island')
      .battlefield(...Array.from({ length: zombiesOnBattlefield }, () => zombie.name))
      .graveyard(...Array.from({ length: zombiesInGraveyard }, () => zombie.name))
      .graveyard(bear.name, { count: 2 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('more Zombies on the battlefield: that many cards (the Prophet itself is one, CR 603.10a: it is on the battlefield as it resolves)', () => {
    const g = board(3, 1);
    g.act(0).cast(prophet.name, { pay: true });
    g.passAll();
    // Three Zombies and the Prophet itself: four, against one Zombie card in the graveyard.
    g.expect.zone(FILLER[0], 'hand', { seat: 0, count: 1 });
    expect(g.state.seats[0]?.hand).toHaveLength(4);
    g.expect.invariants();
  });

  test('more Zombie cards in the graveyard: that many cards, Bears not counted', () => {
    const g = board(0, 5);
    g.act(0).cast(prophet.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(5);
    g.expect.invariants();
  });

  test('equal: that many', () => {
    const g = board(1, 2);
    g.act(0).cast(prophet.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(2);
  });
});

describe('"where X is the number of creature cards in target player\'s graveyard" (CR 115.1, 603.3d)', () => {
  const board = () =>
    defs()
      .seat(0)
      .life(20)
      .library(...FILLER, ...FILLER)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(augur.name)
      .graveyard(zombie.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .graveyard(zombie.name, { count: 3 })
      .graveyard(bear.name)
      .graveyard('Island', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();

  test('the opponent is the target: their three Zombies and a Bear are four creature cards, a land is not one', () => {
    const g = board();
    g.act(0).cast('Murder', { targets: [augur.name], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    // X is read as the ability resolves: the graveyard of the target player (seat 1), four creature cards.
    expect(g.state.seats[0]?.hand).toHaveLength(4);
    g.expect.life(0, 16);
    g.expect.life(1, 20);
    g.expect.invariants();
  });

  test('you are the target: your own graveyard, with the Augur itself in it (CR 603.10a: it died, so it is a creature card there as the ability resolves)', () => {
    const g = board();
    g.act(0).cast('Murder', { targets: [augur.name], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    // The Zombie card and the Augur: two.
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.life(0, 18);
    g.expect.invariants();
  });
});

describe('"return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have" (CR 107.3c, 603.3d, 601.2c)', () => {
  const board = (zombiesInGraveyard: number) =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(hulk.name)
      .battlefield('Swamp')
      .graveyard(...Array.from({ length: zombiesInGraveyard }, () => zombie.name))
      .graveyard(bear.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('one opponent: up to one target, none a legal choice, only Zombie cards of your graveyard offered', () => {
    const g = board(3);
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs).toHaveLength(1);
    expect(d.specs[0]?.min).toBe(0);
    expect(d.specs[0]?.max).toBe(1);
    expect(d.specs[0]?.legal).toHaveLength(3);
    g.act(0).chooseTargets(`${zombie.name}[0]`);
    g.passAll();
    g.expect.zone(zombie.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(zombie.name, 'graveyard', { seat: 0, count: 2 });
    g.expect.zone(bear.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('choosing no target is legal and the ability then does nothing', () => {
    const g = board(3);
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone(zombie.name, 'battlefield', { count: 0 });
    g.expect.zone(zombie.name, 'graveyard', { seat: 0, count: 3 });
  });

  test('no Zombie card in the graveyard: nothing to target, nothing happens', () => {
    const g = board(0);
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(hulk.name, 'battlefield', { seat: 0, count: 1 });
  });
});
