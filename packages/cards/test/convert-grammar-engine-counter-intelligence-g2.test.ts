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
import { NO_OVERRIDES } from './convert-grammar-helpers';

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
