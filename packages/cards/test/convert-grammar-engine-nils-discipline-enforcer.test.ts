// Nils, Discipline Enforcer: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction. Pins: CR 115.1, 601.2c, 603.3d (the end step trigger takes up to one target of each player), CR 122.6 (counters), CR 508.1d and 508.1h (a creature with
// counters pays {1} for each counter to attack Nils's controller or a planeswalker they control), CR 122.1 (counters of any kind), CR 604.1 (static ability of a permanent).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const NILS = real('Nils, Discipline Enforcer');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** Seat 0 controls Nils and Bears; seat 1 controls Elves (with counters when `elfCounters`) and `mountains` Mountains. */
function game(
  opts: { elfCounters?: number; mountains?: number; active?: 0 | 1 } = {},
): ScenarioGame {
  const b = scenario();
  b.define(NILS);
  b.seat(0)
    .library(...FILLER)
    .battlefield(NILS.name, BEARS);
  const theirs = b.seat(1).library(...FILLER);
  theirs.battlefield(ELVES, { counters: { '+1/+1': opts.elfCounters ?? 0 } });
  theirs.battlefield(...Array.from({ length: opts.mountains ?? 0 }, () => 'Mountain'));
  return b.at('precombatMain', { active: opts.active ?? 0, turn: 1 }).build();
}

describe('Nils, Discipline Enforcer', () => {
  test('is valid and supported', () => {
    expect(validateCard(NILS)).toEqual([]);
  });

  test('at the beginning of your end step, a +1/+1 counter goes on one creature of each player', () => {
    const g = game();
    g.advanceTo('end');
    g.act(0).chooseTargets(BEARS, ELVES);
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.counters(ELVES, { '+1/+1': 1 });
  });

  test('up to one: a player may be given no target', () => {
    const g = game();
    g.advanceTo('end');
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.counters(ELVES, {});
  });

  test('the slot takes at most one creature of each player, the controller of the trigger included', () => {
    const g = game();
    g.advanceTo('end');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const spec = d.specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(2);
    expect(spec?.onePerGroup).toBe(true);
    expect(spec?.eachController).toBe(true);
  });

  test('a creature with counters cannot attack Nils controller unless its controller pays {1} for each counter', () => {
    const g = game({ elfCounters: 2, mountains: 1, active: 1 });
    g.advanceTo('declareAttackers', { attack: false });
    const unpayable = g.act(1).try.declareAttackers([{ attacker: g.id(ELVES) }]);
    expect(unpayable.ok).toBe(false);
  });

  test('with the mana, the attack is declared after paying {1}{1}', () => {
    const g = game({ elfCounters: 2, mountains: 2, active: 1 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(ELVES);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.totalCost).toEqual(['1', '1']);
    g.act(1).payAuto();
    g.expect.combat({ attackers: [ELVES] });
  });

  test('a creature with no counters attacks for free', () => {
    const g = game({ active: 1 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(ELVES);
    g.expect.combat({ attackers: [ELVES] });
  });
});
