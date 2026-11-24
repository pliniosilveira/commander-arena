// Counter Intelligence deck (Edge of Eternities Commander), group 2 (moving, removing, counting and choosing counters): the REAL Oracle text of Resourceful Defense, Gavel of the
// Righteous, Inspirit, Flagship Vessel, Empowered Autogenerator, Tekuthal, Inquiry Dominus and Moxite Refinery (golden.jsonl, taken from the issue) goes through the grammar as a card
// with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins (numbers looked up with `pnpm rule` in this session): CR 122.1 (counters), CR 122.5 (moving a counter), CR 122.6 (counters put on an object), CR 603.10a (leaves-the-battlefield
// triggers look back), CR 113.7a (last-known information).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type PendingDecision, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 8 }, () => 'Island');

const DEFENSE = real('Resourceful Defense');
const INSPIRIT = real('Inspirit, Flagship Vessel');
const RING = 'Sol Ring';
const AUTOGEN = real('Empowered Autogenerator');
const TEKUTHAL = real('Tekuthal, Inquiry Dominus');
const MOXITE = real('Moxite Refinery');
const DOUBLER = parsed(
  'SYNTHETIC Proliferation Doubler',
  'Creature — Horror',
  'If you would proliferate, proliferate twice instead.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const PROLIF = parsed('SYNTHETIC Proliferate', 'Sorcery', 'Proliferate.', { manaCost: '{1}' });

describe('Resourceful Defense', () => {
  test('is valid', () => {
    expect(validateCard(DEFENSE)).toEqual([]);
  });

  test('the AST: a leaves trigger that puts the counters the permanent had, and a two-target move of any number', () => {
    const [trigger, move] = DEFENSE.faces[0]?.abilities ?? [];
    expect(trigger).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'putCountersOf', from: { kind: 'triggerSubject' }, to: { kind: 'target' } },
    });
    expect(move).toMatchObject({
      kind: 'activated',
      effect: { kind: 'moveCounter', anyNumber: true },
    });
  });

  const start = (counters: Record<string, number>, seats = 2) => {
    const b = scenario({ seats })
      .define(DEFENSE)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(DEFENSE.name)
      .battlefield(BEARS, { label: 'bears', counters })
      .battlefield(SPIDER, { label: 'spider' });
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield('Giant Spider', { label: `theirs${seat}`, counters: { charge: 1 } });
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('a permanent you control that leaves with counters hands every kind to the target (CR 603.10a, 113.7a, 122.1)', () => {
    const g = start({ charge: 2, '+1/+1': 1 });
    // The +1/+1 counter makes the bears a 3/3, which the bolt still kills.
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.counters('spider', { charge: 2, '+1/+1': 1 });
    g.expect.invariants();
  });

  test('the bears with charge counters die and the trigger puts both counters on the target', () => {
    const g = start({ charge: 2 });
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.counters('spider', { charge: 2 });
    g.expect.invariants();
  });

  test('a permanent with no counter does not trigger it', () => {
    const g = start({});
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a permanent an opponent controls leaving with counters does not trigger it, whoever the opponent is (3 and 4 seats)', () => {
    for (const seats of [2, 3, 4]) {
      const g = start({}, seats);
      g.act(0).cast(BOLT, { targets: ['theirs1'], pay: true });
      g.passAll();
      g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
      g.expect.pending('priority', 0);
    }
  });
});

/** The decision now pending, as the options it offers. */
const pickOptions = (state: { pending: PendingDecision | null }): readonly string[] => {
  const d = state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`pending is ${d?.kind}`);
  expect(d.purpose).toBe('counterPick');
  return d.options;
};

describe('Resourceful Defense: move any number of counters (CR 122.5)', () => {
  const start = (mine: Record<string, number>, seats = 2) => {
    const b = scenario({ seats })
      .define(DEFENSE)
      .seat(0)
      .library(...FILLER)
      .battlefield('Plains', { count: 5 })
      .battlefield(DEFENSE.name)
      .battlefield(BEARS, { label: 'mine', counters: mine })
      .battlefield(SPIDER, { label: 'other' });
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield(SPIDER, { label: `theirs${seat}` });
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('the controller moves one counter at a time and stops when they like', () => {
    const g = start({ charge: 2, '+1/+1': 1 });
    g.act(0).activate(DEFENSE.name, { ability: 1, targets: ['mine', 'other'], pay: true });
    g.passAll();
    expect(pickOptions(g.state)).toEqual([
      'charge counter on Grizzly Bears (yours)',
      '+1/+1 counter on Grizzly Bears (yours)',
      'Done',
    ]);
    g.act(0).chooseOption('charge counter on Grizzly Bears (yours)');
    g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
    g.act(0).chooseOption('Done');
    g.expect.counters('mine', { charge: 1 });
    g.expect.counters('other', { charge: 1, '+1/+1': 1 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('stopping at once moves nothing: any number includes none', () => {
    const g = start({ charge: 2 });
    g.act(0).activate(DEFENSE.name, { ability: 1, targets: ['mine', 'other'], pay: true });
    g.passAll();
    g.act(0).chooseOption('Done');
    g.expect.counters('mine', { charge: 2 });
    g.expect.counters('other', {});
  });

  test('every counter can be moved, and the question ends when none is left', () => {
    const g = start({ charge: 2 });
    g.act(0).activate(DEFENSE.name, { ability: 1, targets: ['mine', 'other'], pay: true });
    g.passAll();
    g.act(0).chooseOption('charge counter on Grizzly Bears (yours)');
    g.act(0).chooseOption('charge counter on Grizzly Bears (yours)');
    g.expect.counters('mine', {});
    g.expect.counters('other', { charge: 2 });
    g.expect.pending('priority', 0);
  });

  test('the second target must be a permanent you control, whoever the opponents are (3 and 4 seats)', () => {
    for (const seats of [2, 3, 4]) {
      for (let seat = 1; seat < seats; seat += 1) {
        const g = start({ charge: 1 }, seats);
        expect(() =>
          g
            .act(0)
            .activate(DEFENSE.name, { ability: 1, targets: ['mine', `theirs${seat}`], pay: true }),
        ).toThrow();
      }
    }
  });
});

describe('Inspirit, Flagship Vessel: your choice of a +1/+1 counter or two charge counters (CR 122.6, 608.2d)', () => {
  test('is valid, and the trigger is part of the 1+ striation (CR 721.2)', () => {
    expect(validateCard(INSPIRIT)).toEqual([]);
    const levels = (INSPIRIT.faces[0]?.abilities ?? []).filter((a) => a.kind === 'stationLevel');
    const one = levels.find((a) => a.kind === 'stationLevel' && a.threshold === 1);
    if (one?.kind !== 'stationLevel') throw new Error('no 1+ symbol');
    expect(one.abilities).toHaveLength(1);
    expect(one.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'chooseOne',
        options: [
          { label: 'a +1/+1 counter', effect: { kind: 'addCounters', counter: '+1/+1', count: 1 } },
          {
            label: 'two charge counters',
            effect: { kind: 'addCounters', counter: 'charge', count: 2 },
          },
        ],
      },
    });
  });

  const start = (charge: number, active = 0, seats = 2) => {
    const b = scenario({ seats })
      .define(INSPIRIT)
      .seat(0)
      .library(...FILLER)
      .battlefield(INSPIRIT.name, charge === 0 ? {} : { counters: { charge } })
      .battlefield(RING, { label: 'ring' });
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield(RING, { label: `theirs${seat}` });
    }
    return b.at('precombatMain', { active, turn: 3 }).build();
  };

  test('with a charge counter, at the beginning of combat on your turn, the controller picks the counters for the artifact', () => {
    const g = start(1);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseTargets('ring');
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('two charge counters');
    g.expect.counters('ring', { charge: 2 });
    g.expect.invariants();
  });

  test('or the +1/+1 counter', () => {
    const g = start(1);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseTargets('ring');
    g.passAll();
    g.act(0).chooseOption('a +1/+1 counter');
    g.expect.counters('ring', { '+1/+1': 1 });
  });

  test('"other": Inspirit itself is not a legal target, and up to one means none is allowed', () => {
    const g = start(1);
    g.advanceTo('beginningOfCombat');
    expect(() => g.act(0).chooseTargets(INSPIRIT.name)).toThrow();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters('ring', {});
  });

  test('with no charge counter the 1+ ability is not there (CR 721.2)', () => {
    const g = start(0);
    g.advanceTo('beginningOfCombat');
    g.expect.pending('priority', 0);
    g.expect.counters('ring', {});
  });

  test('only on your turn; the artifact may be any other one, an opponent of any seat included (2, 3 and 4 seats)', () => {
    for (const seats of [2, 3, 4]) {
      const theirTurn = start(1, 1, seats);
      theirTurn.advanceTo('beginningOfCombat');
      theirTurn.expect.pending('priority', 1);
      for (let seat = 1; seat < seats; seat += 1) {
        const mine = start(1, 0, seats);
        mine.advanceTo('beginningOfCombat');
        mine.act(0).chooseTargets(`theirs${seat}`);
        mine.passAll();
        mine.act(0).chooseOption('two charge counters');
        mine.expect.counters(`theirs${seat}`, { charge: 2 });
      }
    }
  });
});

describe('Empowered Autogenerator: put a charge counter, then add that many mana of one color (CR 605.1a, 605.3b)', () => {
  test("is valid; the counter is the ability's first step and the amount counts after it", () => {
    expect(validateCard(AUTOGEN)).toEqual([]);
    expect(AUTOGEN.faces[0]?.abilities.find((a) => a.kind === 'mana')).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      putCounter: { counter: 'charge', count: 1 },
      production: { kind: 'anyColorAmount', amount: { kind: 'countersOn', counter: 'charge' } },
    });
  });

  const start = (charge: number, ...more: string[]) =>
    scenario()
      .define(AUTOGEN)
      .seat(0)
      .library(...FILLER)
      .hand(BEARS)
      .battlefield(AUTOGEN.name, charge === 0 ? {} : { counters: { charge } })
      .battlefield(...more)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with no counter it puts one and adds one mana of the color chosen', () => {
    const g = start(0);
    g.act(0).tapForMana(AUTOGEN.name, { color: 'R' });
    g.expect.counters(AUTOGEN.name, { charge: 1 });
    g.expect.pool(0, 'R');
    g.expect.tapped(AUTOGEN.name);
  });

  test('with two it has three after the new one: three mana of one color', () => {
    const g = start(2);
    g.act(0).tapForMana(AUTOGEN.name, { color: 'G' });
    g.expect.counters(AUTOGEN.name, { charge: 3 });
    g.expect.pool(0, 'GGG');
  });

  test('it makes one color only: a mix is not offered', () => {
    const g = start(1);
    expect(() => g.act(0).tapForMana(AUTOGEN.name)).toThrow();
    g.act(0).tapForMana(AUTOGEN.name, { color: 'W' });
    g.expect.pool(0, 'WW');
  });

  test('the payment of a spell counts the mana it will make after the counter: one counter pays {1}{G}', () => {
    const g = start(1);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(AUTOGEN.name, { charge: 2 });
    g.expect.invariants();
  });

  test('with no counter its one mana is not enough for a two-mana spell', () => {
    const g = start(0);
    expect(g.act(0).try.cast(BEARS).ok).toBe(false);
  });
});

describe('Tekuthal, Inquiry Dominus: proliferate twice, and remove three counters from among other permanents', () => {
  test('is valid, with a replacement of proliferate and a remove-any-counters cost', () => {
    expect(validateCard(TEKUTHAL)).toEqual([]);
    const abilities = TEKUTHAL.faces[0]?.abilities ?? [];
    expect(abilities.find((a) => a.kind === 'replacement')).toMatchObject({
      kind: 'replacement',
      replacement: { kind: 'proliferateDouble' },
    });
    const activated = abilities.find((a) => a.kind === 'activated');
    if (activated?.kind !== 'activated') throw new Error('no activated ability');
    expect(activated.cost).toContainEqual({
      kind: 'removeCounters',
      count: 3,
      among: {
        controller: 'you',
        other: true,
        anyOf: [{ types: ['artifact'] }, { types: ['creature'] }, { types: ['planeswalker'] }],
      },
    });
  });

  describe('If you would proliferate, proliferate twice instead (CR 701.34a, 614.5)', () => {
    const start = (tekuthals = 0, doublers = 0) => {
      const b = scenario()
        .define(TEKUTHAL)
        .define(DOUBLER)
        .define(PROLIF)
        .seat(0)
        .library(...FILLER)
        .hand(PROLIF.name)
        .battlefield('Island')
        .battlefield(BEARS, { label: 'bears', counters: { charge: 1 } });
      if (tekuthals > 0) b.battlefield(TEKUTHAL.name);
      for (let i = 0; i < doublers; i += 1) b.battlefield(DOUBLER.name);
      return b
        .seat(1)
        .library(...FILLER)
        .battlefield(SPIDER, { label: 'theirs', counters: { charge: 1 } })
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
    };

    test('without it, one proliferate: one choice', () => {
      const g = start();
      g.act(0).cast(PROLIF.name, { pay: true });
      g.passAll();
      g.act(0).choosePermanents('bears', 'theirs');
      g.expect.counters('bears', { charge: 2 });
      g.expect.counters('theirs', { charge: 2 });
      g.expect.pending('priority', 0);
    });

    test('with it, two proliferates in a row, each its own choice: a counter is added twice', () => {
      const g = start(1);
      g.act(0).cast(PROLIF.name, { pay: true });
      g.passAll();
      g.act(0).choosePermanents('bears', 'theirs');
      g.expect.counters('bears', { charge: 2 });
      g.expect.pending('choosePermanent', 0);
      g.act(0).choosePermanents('bears');
      g.expect.counters('bears', { charge: 3 });
      g.expect.counters('theirs', { charge: 2 });
      g.expect.pending('priority', 0);
      g.expect.invariants();
    });

    test('an opponent does not get it: it applies to the controller of the permanent only', () => {
      const g = scenario({ seats: 3 })
        .define(TEKUTHAL)
        .define(PROLIF)
        .seat(0)
        .library(...FILLER)
        .battlefield(TEKUTHAL.name)
        .seat(1)
        .library(...FILLER)
        .hand(PROLIF.name)
        .battlefield('Island')
        .battlefield(BEARS, { label: 'bears', counters: { charge: 1 } })
        .seat(2)
        .library(...FILLER)
        .at('precombatMain', { active: 1, turn: 3 })
        .build();
      g.act(1).cast(PROLIF.name, { pay: true });
      g.passAll();
      g.act(1).choosePermanents('bears');
      g.expect.counters('bears', { charge: 2 });
      g.expect.pending('priority', 1);
    });

    test('two of them apply once each (CR 614.5, as two doubling effects make four times as much): four proliferates', () => {
      const g = start(1, 1);
      g.act(0).cast(PROLIF.name, { pay: true });
      g.passAll();
      for (let i = 0; i < 4; i += 1) {
        g.expect.pending('choosePermanent', 0);
        g.act(0).choosePermanents('bears');
      }
      g.expect.counters('bears', { charge: 5 });
      g.expect.pending('priority', 0);
    });
  });

  describe('{1}{U/P}{U/P}, Remove three counters from among other artifacts, creatures, and planeswalkers you control: an indestructible counter on it (CR 118.3, 122.1)', () => {
    const start = (
      mine: Record<string, number>,
      ring: Record<string, number>,
      self: Record<string, number> = {},
      seats = 2,
    ) => {
      const b = scenario({ seats })
        .define(TEKUTHAL)
        .seat(0)
        .library(...FILLER)
        .battlefield('Island', { count: 3 })
        .battlefield(TEKUTHAL.name, { counters: self })
        .battlefield(BEARS, { label: 'bears', counters: mine })
        .battlefield(RING, { label: 'ring', counters: ring });
      for (let seat = 1; seat < seats; seat += 1) {
        b.seat(seat)
          .library(...FILLER)
          .battlefield(SPIDER, { label: `theirs${seat}`, counters: { charge: 5 } });
      }
      return b.at('precombatMain', { active: 0, turn: 3 }).build();
    };

    test('exactly as many counters as owed on other permanents: they come off without a question', () => {
      const g = start({ charge: 2 }, { '+1/+1': 1 });
      g.act(0).activate(TEKUTHAL.name, { pay: true });
      g.passAll();
      g.expect.counters('bears', {});
      g.expect.counters('ring', {});
      g.expect.counters(TEKUTHAL.name, { indestructible: 1 });
      g.expect.derived(TEKUTHAL.name, { keywords: ['flying', 'indestructible'] });
      g.expect.invariants();
    });

    test('more than owed: the player picks each counter, the permanent and the kind', () => {
      const g = start({ charge: 2, '+1/+1': 1 }, { charge: 1 });
      g.act(0).activate(TEKUTHAL.name, { pay: true });
      g.expect.pending('chooseOption', 0);
      expect(pickOptions(g.state)).toEqual([
        'charge counter on Grizzly Bears (yours)',
        '+1/+1 counter on Grizzly Bears (yours)',
        'charge counter on Sol Ring (yours)',
      ]);
      g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
      g.act(0).chooseOption('charge counter on Sol Ring (yours)');
      // One counter is still owed and only one kind on one permanent is left: nothing to choose, the engine takes it.
      g.passAll();
      g.expect.counters('bears', { charge: 1 });
      g.expect.counters('ring', {});
      g.expect.counters(TEKUTHAL.name, { indestructible: 1 });
    });

    test('cancel takes the activation back', () => {
      const g = start({ charge: 2, '+1/+1': 1 }, { charge: 1 });
      g.act(0).activate(TEKUTHAL.name, { pay: true });
      g.act(0).chooseOption('charge counter on Sol Ring (yours)');
      g.act(0).cancel();
      g.expect.counters('ring', { charge: 1 });
      g.expect.counters('bears', { charge: 2, '+1/+1': 1 });
      g.expect.pending('priority', 0);
    });

    test('its own counters and the opponents counters are not among them ("other", "you control"), whatever the seat count', () => {
      for (const seats of [2, 3, 4]) {
        const g = start({ charge: 1 }, {}, { charge: 4 }, seats);
        expect(g.act(0).try.activate(TEKUTHAL.name).ok, `${seats} seats`).toBe(false);
      }
    });
  });
});

describe('Moxite Refinery: remove X counters from one artifact or creature, then put X on a target (CR 107.3a, 118.3, 122.1, 602.2b)', () => {
  test('is valid: a modal sorcery-speed ability whose cost is the X announced, all off one permanent', () => {
    expect(validateCard(MOXITE)).toEqual([]);
    const activated = MOXITE.faces[0]?.abilities.find((a) => a.kind === 'activated');
    if (activated?.kind !== 'activated') throw new Error('no activated ability');
    expect(activated.timing).toBe('sorcery');
    expect(activated.cost).toEqual([
      { kind: 'mana', symbols: ['2'] },
      { kind: 'tap' },
      {
        kind: 'removeCounters',
        count: 1,
        countX: true,
        fromOne: true,
        among: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }], controller: 'you' },
      },
    ]);
    expect(activated.modes).toHaveLength(2);
  });

  const start = (mine: Record<string, number>, ring: Record<string, number>, seats = 2) => {
    const b = scenario({ seats })
      .define(MOXITE)
      .seat(0)
      .library(...FILLER)
      .battlefield('Island', { count: 2 })
      .battlefield(MOXITE.name)
      .battlefield(BEARS, { label: 'bears', counters: mine })
      .battlefield(RING, { label: 'ring', counters: ring });
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield(SPIDER, { label: `theirs${seat}`, counters: { charge: 9 } });
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('X = 2 from a creature with three charge counters, put on a target artifact as charge counters', () => {
    const g = start({ charge: 3 }, {});
    g.act(0).activate(MOXITE.name, { modes: [0], x: 2, targets: ['ring'], pay: true });
    g.passAll();
    g.expect.counters('bears', { charge: 1 });
    g.expect.counters('ring', { charge: 2 });
    g.expect.tapped(MOXITE.name, true);
    g.expect.invariants();
  });

  test('the other mode puts X +1/+1 counters on a target creature', () => {
    const g = start({}, { charge: 3 });
    g.act(0).activate(MOXITE.name, { modes: [1], x: 3, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('ring', {});
    g.expect.counters('bears', { '+1/+1': 3 });
    g.expect.pt('bears', 5, 5);
  });

  test('all the counters come off one permanent: with two that have enough the player picks one and the rest follow it', () => {
    const g = start({ charge: 2, '+1/+1': 1 }, { charge: 2 });
    g.act(0).activate(MOXITE.name, { modes: [1], x: 2, targets: ['bears'], pay: true });
    g.expect.pending('chooseOption', 0);
    expect(pickOptions(g.state)).toEqual([
      'charge counter on Grizzly Bears (yours)',
      '+1/+1 counter on Grizzly Bears (yours)',
      'charge counter on Sol Ring (yours)',
    ]);
    g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
    // The bears are the permanent now: the Sol Ring is no longer offered, and only one kind is left on them.
    g.passAll();
    // One counter is still owed: the bears have one kind left, so it comes off without a question. The mode puts the two +1/+1 counters on.
    g.expect.counters('bears', { charge: 1, '+1/+1': 2 });
    g.expect.counters('ring', { charge: 2 });
  });

  test('a permanent with fewer counters than X is not a choice: the one that has enough gives them', () => {
    const g = start({ charge: 1 }, { charge: 3 });
    g.act(0).activate(MOXITE.name, { modes: [1], x: 3, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('ring', {});
    g.expect.counters('bears', { charge: 1, '+1/+1': 3 });
  });

  test('X is at most what one permanent has: counters spread over two permanents do not add up', () => {
    const g = start({ charge: 2 }, { charge: 2 });
    g.act(0).activate(MOXITE.name, { modes: [1] });
    g.expect.pending('chooseX', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('no X question');
    expect(d.max).toBe(2);
  });

  test('cancel takes the activation back', () => {
    const g = start({ charge: 2, '+1/+1': 1 }, { charge: 2 });
    g.act(0).activate(MOXITE.name, { modes: [1], x: 2, targets: ['bears'], pay: true });
    g.expect.pending('chooseOption', 0);
    g.act(0).cancel();
    g.expect.counters('ring', { charge: 2 });
    g.expect.counters('bears', { charge: 2, '+1/+1': 1 });
    g.expect.tapped(MOXITE.name, false);
  });

  test('only counters on your own artifacts and creatures, whoever the opponents are (3 and 4 seats), and only as a sorcery', () => {
    for (const seats of [2, 3, 4]) {
      const g = start({}, {}, seats);
      // The opponents' spiders hold nine counters each, none of them usable: X can only be 0.
      g.act(0).activate(MOXITE.name, { modes: [0], targets: ['ring'], pay: true });
      g.passAll();
      g.expect.counters('ring', {});
      for (let seat = 1; seat < seats; seat += 1) g.expect.counters(`theirs${seat}`, { charge: 9 });
    }
    const late = start({ charge: 2 }, {});
    late.advanceTo('declareAttackers');
    expect(late.act(0).try.activate(MOXITE.name).ok).toBe(false);
  });
});
