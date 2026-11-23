// The Azula deck (issue 597): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('Mystical Teachings: a search for an instant card or a card with flash (CR 701.23, 702.8a)', () => {
  const TEACHINGS = 'Mystical Teachings';
  const FLASHER = 'SYNTHETIC Thief Dragon';
  const teachings = real(TEACHINGS);

  const board = () =>
    scenario()
      .define(teachings)
      .define(syntheticCard(FLASHER))
      .seat(0)
      .library('Swamp', 'Grizzly Bears', FLASHER, 'Lightning Bolt', 'Swamp')
      .hand(TEACHINGS)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(teachings)).toEqual([]);
  });

  test('finds a card with flash or an instant, and nothing else', () => {
    for (const found of [FLASHER, 'Lightning Bolt']) {
      const g = board();
      g.act(0).cast(TEACHINGS, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(g.id(found));
      g.expect.zone(found, 'hand', { seat: 0 });
      g.expect.eventLog(
        [
          { kind: 'librarySearched', seat: 0, found: 1 },
          { kind: 'libraryShuffled', seat: 0 },
        ],
        { since: 0 },
      );
      g.expect.invariants();
    }
  });

  test('a creature without flash is not offered', () => {
    const g = board();
    g.act(0).cast(TEACHINGS, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(g.id('Grizzly Bears'))).toThrow();
  });
});

describe('Bulk Up: "Double target creature\'s power until end of turn" (CR 701.10)', () => {
  const BULK = 'Bulk Up';
  const bulk = real(BULK);

  const board = () =>
    scenario()
      .define(bulk)
      .seat(0)
      .hand(BULK)
      .battlefield('Mountain', 'Mountain', 'Grizzly Bears')
      .seat(1)
      .library('Swamp', 'Swamp')
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(bulk)).toEqual([]);
  });

  test('doubles the power of the target and leaves its toughness alone', () => {
    const g = board();
    g.act(0).cast(BULK, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pt('Grizzly Bears', 4, 2);
    g.expect.pt('Llanowar Elves', 1, 1);
    g.expect.invariants();
  });

  test('it can be a creature an opponent controls', () => {
    const g = board();
    g.act(0).cast(BULK, { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    g.expect.pt('Llanowar Elves', 2, 1);
  });
});

describe('Frostcliff Siege: abilities linked to the option chosen as it entered (CR 607.2d, 614.12)', () => {
  const SIEGE = 'Frostcliff Siege';
  const siege = real(SIEGE);

  const board = (option: 'Jeskai' | 'Temur') =>
    scenario()
      .define(siege)
      .seat(0)
      .battlefield(SIEGE, { chosen: { option } })
      .battlefield('Grizzly Bears')
      .library('Swamp', 'Swamp')
      .seat(1)
      .battlefield('Llanowar Elves')
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(siege)).toEqual([]);
  });

  test('Temur: my creatures get +1/+0 and have trample and haste, theirs do not', () => {
    const g = board('Temur');
    g.expect.pt('Grizzly Bears', 3, 2);
    g.expect.derived('Grizzly Bears', { keywords: ['trample', 'haste'] });
    g.expect.pt('Llanowar Elves', 1, 1);
    g.expect.derived('Llanowar Elves', { keywords: [] });
  });

  test('Jeskai: the creatures are not changed', () => {
    const g = board('Jeskai');
    g.expect.pt('Grizzly Bears', 2, 2);
    g.expect.derived('Grizzly Bears', { keywords: [] });
  });
});

describe('Firebending N (CR 702.189a, 500.5a): add N {R} as it attacks, kept until end of combat', () => {
  const BENDER = parsed('SYNTHETIC Parsed Firebender', 'Creature — Human Monk', 'Firebending 2', {
    manaCost: '{1}{R}',
    colors: ['R'],
    power: '2',
    toughness: '2',
  });
  const NAME = BENDER.name;
  const FILLER = Array.from({ length: 8 }, () => 'Island');

  const attack = () => {
    const g = scenario()
      .define(BENDER)
      .seat(0)
      .library(...FILLER)
      .battlefield(NAME)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: NAME }]);
    return g;
  };

  test('is valid and is a triggered ability the engine expands', () => {
    expect(validateCard(BENDER)).toEqual([]);
  });

  test('the trigger uses the stack, adds {R}{R} when it resolves', () => {
    const g = attack();
    g.expect.stack([`${NAME} (ability)`]);
    g.expect.pool(0, {});
    g.passAll();
    g.expect.pool(0, { R: 2 });
    g.expect.invariants();
  });

  test('the mana is still there through the combat steps and gone when combat ends', () => {
    const g = attack();
    g.passAll();
    g.expect.pool(0, { R: 2 });
    g.advanceTo('combatDamage');
    g.expect.pool(0, { R: 2 });
    g.advanceTo('endOfCombat');
    g.expect.pool(0, { R: 2 });
    g.advanceTo('postcombatMain');
    g.expect.pool(0, {});
  });
});

describe('Fire Nation Palace: {1}{R}, {T}: Target creature you control gains firebending 4 until end of turn', () => {
  const PALACE = 'Fire Nation Palace';
  const palace = real(PALACE);

  test('is valid', () => {
    expect(validateCard(palace)).toEqual([]);
  });

  test('it enters tapped unless I control a basic land (CR 614.1d)', () => {
    for (const [lands, tapped] of [
      [['Mountain'], false],
      [[], true],
    ] as const) {
      const g = scenario()
        .define(palace)
        .seat(0)
        .hand(PALACE)
        .battlefield(...lands)
        .library('Island', 'Island')
        .seat(1)
        .library('Island', 'Island')
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).playLand(PALACE);
      g.expect.tapped(PALACE, tapped);
    }
  });

  test('the creature gains firebending 4 and attacking adds {R}{R}{R}{R}', () => {
    const g = scenario()
      .define(palace)
      .seat(0)
      .battlefield(PALACE, 'Mountain', 'Mountain', 'Grizzly Bears')
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(PALACE, { ability: 2, targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears', { keywords: ['firebending'] });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'Grizzly Bears' }]);
    g.passAll();
    g.expect.pool(0, { R: 4 });
  });
});

describe('Fire Lord Azula: "Whenever you cast a spell while ~ is attacking, copy that spell." (CR 603.2, 707.10)', () => {
  const AZULA = 'Fire Lord Azula';
  const BOLT = 'Lightning Bolt';
  const azula = real(AZULA);

  const board = (attack: boolean) => {
    const g = scenario()
      .define(azula)
      .seat(0)
      .battlefield(AZULA)
      .hand(BOLT)
      .library('Island', 'Island')
      .seat(1)
      .battlefield('Llanowar Elves', 'Grizzly Bears')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    if (attack) {
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).declareAttackers([{ attacker: AZULA }]);
      g.passAll();
    }
    return g;
  };

  test('is valid', () => {
    expect(validateCard(azula)).toEqual([]);
  });

  test('while it is attacking, the firebending mana pays for a spell that is copied', () => {
    const g = board(true);
    g.expect.pool(0, { R: 2 });
    g.act(0).cast(BOLT, { targets: ['Grizzly Bears'], pay: true });
    g.expect.stack([`${AZULA} (ability)`, BOLT]);
    g.pass();
    g.pass();
    // The copy is on the stack, ahead of the original, and its controller may choose new targets (CR 707.10c, 603.3).
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: 'Llanowar Elves' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('when it is not attacking, nothing is copied', () => {
    const g = scenario()
      .define(azula)
      .seat(0)
      .battlefield(AZULA, 'Mountain')
      .hand(BOLT)
      .library('Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: ['Grizzly Bears'], pay: true });
    g.expect.stack([BOLT]);
  });
});
