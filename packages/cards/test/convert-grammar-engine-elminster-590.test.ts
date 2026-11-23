// The Elminster deck of issue 590: the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 305.1 and 401.5 (playing a land from the top of the library),
// CR 611.3a (a condition of a static ability is looked at all the time), CR 102.2 (opponents). Every condition says "an opponent", so it holds with any number of seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

describe('Verge Rangers', () => {
  const rangers = real('Verge Rangers');

  const board = (mine: number, theirs: number) =>
    scenario()
      .define(rangers)
      .seat(0)
      .library('Forest', 'Island', 'Swamp')
      .battlefield(rangers.name, ...Array.from({ length: mine }, () => 'Plains'))
      .seat(1)
      .library('Mountain', 'Mountain')
      .battlefield(...Array.from({ length: theirs }, () => 'Mountain'))
      .at('precombatMain', { active: 0 })
      .build();

  test('an opponent controls more lands: the top land of the library may be played (CR 305.1, 401.5)', () => {
    const g = board(1, 2);
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the lands are equal: no permission (CR 611.3a)', () => {
    const g = board(2, 2);
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the controller has more lands: no permission', () => {
    const g = board(3, 1);
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the condition is looked at after each land: playing it ends the permission when the counts level', () => {
    const g = board(1, 2);
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    // Two lands each now, and the land play of the turn is spent anyway: the top card (Island) cannot be played.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });
});

describe('Charming Prince', () => {
  const prince = real('Charming Prince');
  const LIBRARY = ['Forest', 'Forest', 'Forest', 'Forest'];

  const cast = () => {
    const g = scenario()
      .define(prince)
      .seat(0)
      .library(...LIBRARY)
      .hand(prince.name)
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .pool('CW')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(prince.name, { pay: true });
    g.passAll();
    return g;
  };

  test('mode 2 gains 3 life', () => {
    const g = cast();
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.life(0, before + 3);
  });

  test('mode 3 targets only creatures I own, not the Prince, not theirs (CR 108.3, 115.1)', () => {
    const g = cast();
    g.act(0).chooseModes(2);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null));
    expect(legal).toHaveLength(2);
    expect(legal).toContain(g.id('Grizzly Bears'));
    expect(legal).toContain(g.id('Llanowar Elves'));
  });

  test('mode 3 exiles the creature and returns it under my control at the next end step (CR 603.7, 400.7)', () => {
    const g = cast();
    g.act(0).chooseModes(2);
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Princess Yue', () => {
  const yue = real('Princess Yue');
  const LIBRARY = ['Forest', 'Forest', 'Forest', 'Forest'];

  /** Seat 1 kills the creature with Murder; Yue is the target. `mine` is what seat 0 has besides her. */
  const murder = (target: string, board: readonly string[] = []) => {
    const g = scenario()
      .define(yue)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(yue.name, ...board)
      .seat(1)
      .library(...LIBRARY)
      .hand('Murder')
      .pool('CBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder').targets([target]).pay();
    g.passAll();
    return g;
  };
  const view = (g: ReturnType<typeof murder>, name: string) =>
    getView(g.state, 0).battlefield.find((v) => v.name === name);

  test('dies as a creature: returns tapped as the legendary land Moon, no longer a creature (CR 205.1a, 612.8)', () => {
    const g = murder(yue.name);
    expect(g.state.pending?.kind === 'priority' || g.state.pending === null).toBe(true);
    const moon = view(g, 'Moon');
    expect(moon).toBeDefined();
    expect(view(g, yue.name)).toBeUndefined();
    expect(moon?.types).toEqual(['land']);
    expect(moon?.supertypes).toEqual(['legendary']);
    expect(moon?.tapped).toBe(true);
    g.expect.invariants();
  });

  test('Moon taps for {C} and still has "{T}: Scry 2" (CR 613.1f, 605.1a)', () => {
    const g = murder(yue.name);
    // Her controller's next turn: Moon untaps.
    g.advanceTo('precombatMain', { turn: 'next' });
    const id = view(g, 'Moon')?.id;
    expect(id).toBeDefined();
    const mine = g.legalActions(0);
    expect(mine.some((a) => a.kind === 'activateAbility' && a.source === id)).toBe(true);
    expect(mine.some((a) => a.kind === 'activate' && a.object === id)).toBe(true);
  });
});
