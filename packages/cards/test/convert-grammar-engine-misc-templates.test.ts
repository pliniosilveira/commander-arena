// Draconic Dissent, group misc-templates: wordings read by the grammar and played through applyAction. Every card is a SYNTHETIC
// card whose text is the wording of the real card of the golden corpus (name replaced by ~).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

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
    .at('precombatMain')
    .build();
}

describe('"{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped." (CR 205.4, 608.2d)', () => {
  const generator = parsed(
    'SYNTHETIC Parsed Generator',
    'Land',
    '{T}: Add {C}.\n{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped.',
  );

  test('a basic land of the hand is put onto the battlefield tapped', () => {
    const g = main((b) =>
      b
        .define(generator)
        .battlefield(generator.name)
        .battlefield('Plains', { count: 2 })
        .hand('Forest'),
    );
    g.act(0).activate(generator.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
    g.expect.invariants();
  });

  test('a land that is not basic is no candidate: nothing is put onto the battlefield', () => {
    const g = main((b) =>
      b
        .define(generator)
        .battlefield(generator.name)
        .battlefield('Plains', { count: 2 })
        .hand('SYNTHETIC Drowsy Land'),
    );
    g.act(0).activate(generator.name, { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Drowsy Land', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

describe('"Whenever a creature an opponent controls attacks, if you\'re the defending player, create a 3/3 red Ogre creature token unless that creature\'s controller pays {3}." (CR 508.5, 118.12, 603.4)', () => {
  const tyrant = parsed(
    'SYNTHETIC Parsed Tyrant',
    'Legendary Creature — Ogre Warrior',
    "Whenever a creature an opponent controls attacks, if you're the defending player, create a 3/3 red Ogre creature token unless that creature's controller pays {3}.",
    { manaCost: '{3}{R}{R}', colors: ['R'], power: '5', toughness: '4' },
  );
  const GOBLIN = 'Raging Goblin';

  const ogres = (g: ReturnType<typeof main>, seat: number): number =>
    g.state.battlefield.filter((id) => {
      const o = g.state.objects[id];
      return o?.token?.characteristics.subtypes.includes('Ogre') === true && o.controller === seat;
    }).length;

  test('the trigger is the attack event aimed at the defending player; the payer is the controller of the creature', () => {
    const text = JSON.stringify(tyrant);
    expect(text).toContain('"kind":"attacks"');
    expect(text).toContain('"at":"defendingYou"');
    expect(text).toContain('{"kind":"controllerOf","of":{"kind":"triggerSubject"}}');
  });

  const duel = (lands: number) => {
    const b = scenario()
      .seat(0)
      .define(tyrant)
      .library(...FILLER)
      .battlefield(tyrant.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(GOBLIN);
    return (lands === 0 ? b : b.battlefield('Mountain', { count: lands }))
      .at('precombatMain', { active: 1 })
      .build();
  };

  test('an opponent attacks me and cannot pay: the Ogre arrives under my control', () => {
    const g = duel(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([GOBLIN]);
    g.passAll();
    expect(ogres(g, 0)).toBe(1);
    expect(ogres(g, 1)).toBe(0);
  });

  test('the attacker declines to pay {3}: the Ogre arrives', () => {
    const g = duel(3);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([GOBLIN]);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.passAll();
    expect(ogres(g, 0)).toBe(1);
  });

  test('the attacker pays {3}: no Ogre', () => {
    const g = duel(3);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([GOBLIN]);
    g.passAll();
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    expect(ogres(g, 0)).toBe(0);
    g.expect.invariants();
  });

  test('the creature attacks a planeswalker I control: I am the defending player (CR 508.5)', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(tyrant)
      .library(...FILLER)
      .battlefield(tyrant.name)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .seat(1)
      .library(...FILLER)
      .battlefield(GOBLIN)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([GOBLIN], 'SYNTHETIC Vanilla Planeswalker');
    g.passAll();
    expect(ogres(g, 0)).toBe(1);
  });

  test("three seats: a creature attacking another player does not trigger it, one attacking me does (the payer is that creature's controller)", () => {
    const build = () =>
      scenario({ seats: 3 })
        .seat(0)
        .define(tyrant)
        .library(...FILLER)
        .battlefield(tyrant.name)
        .seat(1)
        .library(...FILLER)
        .battlefield(GOBLIN)
        .battlefield('Mountain', { count: 3 })
        .seat(2)
        .library(...FILLER)
        .at('precombatMain', { active: 1 })
        .build();
    const away = build();
    away.advanceTo('declareAttackers', { attack: false });
    away.act(1).attack([GOBLIN], { player: 2 });
    away.passAll();
    expect(ogres(away, 0)).toBe(0);
    const towards = build();
    towards.advanceTo('declareAttackers', { attack: false });
    towards.act(1).attack([GOBLIN], { player: 0 });
    towards.passAll();
    towards.expect.pending('confirmOptional', 1);
  });
});

describe('"The first artifact spell you cast each turn costs {1} less to cast." (CR 118.7a, 601.2f, 601.2i)', () => {
  const discount = parsed(
    'SYNTHETIC Parsed Discount',
    'Enchantment',
    'The first artifact spell you cast each turn costs {1} less to cast.',
    { manaCost: '{1}{U}', colors: ['U'] },
  );
  const JUGGERNAUT = 'SYNTHETIC Dust Juggernaut'; // artifact creature, MV 4
  const DRONE = 'SYNTHETIC Colorless Drone'; // artifact creature, MV 2
  const WARD = 'SYNTHETIC Dull Ward'; // white enchantment, MV 2

  const board = (lands: number) =>
    main((b) =>
      b
        .define(discount)
        .battlefield(discount.name)
        .battlefield('Plains', { count: lands })
        .hand(JUGGERNAUT, DRONE, WARD),
    );

  test('the first artifact spell costs {1} less, the second its full cost', () => {
    const g = board(4);
    g.act(0).cast(DRONE, { pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 0 });
    // One of the four lands paid for the Drone ({2} less {1}): three are left, and the Juggernaut needs {4}.
    expect(() => g.act(0).cast(JUGGERNAUT, { pay: true })).toThrow();
  });

  test('with five lands both artifacts can be cast: 1 and then 4', () => {
    const g = board(5);
    g.act(0).cast(DRONE, { pay: true });
    g.passAll();
    g.act(0).cast(JUGGERNAUT, { pay: true });
    g.passAll();
    g.expect.zone(JUGGERNAUT, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a spell that is not an artifact is not reduced and does not use up the reduction', () => {
    const g = board(3);
    g.act(0).cast(WARD, { pay: true });
    g.passAll();
    g.act(0).cast(DRONE, { pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 0 });
  });
});
