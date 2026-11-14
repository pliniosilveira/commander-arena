// The Hashaton deck program (issue 31), group 3 (D-378 to D-380): the REAL Oracle text of Darksteel Angel and Bard, King of Dale (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so
// the nodes the parser writes for the real text are what the engine runs. The helper cards are old fixtures and SYNTHETIC cards. Pins: CR 122.6 and 101.2 (counters
// that can't be put on), CR 614.1a, 614.5 and 614.11 (replacement effects of a draw and of the creation of tokens), CR 504.1 (the first draw of the draw step), CR 111.2.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const ROT = 'SYNTHETIC Rot Boon'; // {B}: a -1/-1 counter on target creature
const PERSIST = 'SYNTHETIC Persist Bear';
const WITHER = 'SYNTHETIC Wither Imp';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const STUDY = 'SYNTHETIC Quick Study'; // {U}: draw a card
const MUSTER = 'SYNTHETIC Muster Call'; // {1}{W}: two tapped Soldier tokens
const MEND = 'SYNTHETIC Mend'; // {W}: gain 3 life

describe('Darksteel Angel: "Creatures you control can\'t have -1/-1 counters put on them."', () => {
  const angel = real('Darksteel Angel');
  const ANGEL = angel.name;

  test('the card is valid', () => {
    expect(validateCard(angel)).toEqual([]);
  });

  test("a -1/-1 counter is not put on its controller's creatures, and is put on the opponent's", () => {
    const g = scenario()
      .define(angel)
      .seat(0)
      .battlefield(ANGEL, 'Swamp', 'Swamp')
      .hand(ROT, ROT)
      .battlefield('Grizzly Bears', { label: 'mine' })
      .library(...FILLER)
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .library(...FILLER)
      .build();
    g.act(0).cast({ name: ROT, zone: 'hand', nth: 0 }, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['-1/-1']).toBeUndefined();
    g.act(0).cast({ name: ROT, zone: 'hand', nth: 0 }, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(g.object('theirs').counters['-1/-1']).toBe(1);
  });

  test("wither damage to its controller's creature marks nothing, and persist returns without the counter", () => {
    const g = scenario()
      .define(angel)
      .seat(0)
      .battlefield(ANGEL, SPIDER, PERSIST)
      .library(...FILLER)
      .seat(1)
      .battlefield(WITHER)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [PERSIST], pay: true });
    g.passAll();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    expect(g.object({ name: PERSIST, zone: 'battlefield' }).counters['-1/-1']).toBeUndefined();
    g.expect.invariants();
  });

  test("it also keeps the game going: its controller can't lose it, and its own text is run (flying, indestructible)", () => {
    const g = scenario()
      .define(angel)
      .seat(0)
      .life(1)
      .battlefield(ANGEL)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.derived(ANGEL, { keywords: ['flying', 'indestructible'] });
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.hasLost(0, false);
  });
});

describe('Bard, King of Dale: the two replacement effects', () => {
  const bard = real('Bard, King of Dale');
  const BARD = bard.name;

  test('the card is valid', () => {
    expect(validateCard(bard)).toEqual([]);
  });

  test('the draw step draws one card; a draw after it, by an instant, draws two', () => {
    const g = scenario()
      .define(bard)
      .seat(0)
      .battlefield(BARD, 'Island')
      .hand(STUDY)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.step('draw', { active: 0 });
    g.expect.handSize(0, 2); // Quick Study and the card of the draw step
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.eventLog([{ kind: 'drawReplaced', seat: 0, count: 2 }]);
  });

  test('the tokens a spell makes are doubled, and stay tapped', () => {
    const g = scenario()
      .define(bard)
      .seat(0)
      .battlefield(BARD, 'Plains', 'Plains')
      .hand(MUSTER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    const soldiers = g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Soldier',
    );
    expect(soldiers).toHaveLength(4);
    expect(soldiers.every((id) => g.state.objects[id]?.tapped === true)).toBe(true);
  });

  test("Ob Nixilis's Angel, made at the end step after a life gain, is doubled too", () => {
    const ob = real('Ob Nixilis, the Ascended');
    const g = scenario()
      .define(bard)
      .define(ob)
      .seat(0)
      .battlefield(BARD, ob.name, 'Plains')
      .hand(MEND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    const angels = g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Angel',
    );
    expect(angels).toHaveLength(2);
  });

  test('two replacements (Bard is legendary, so the other is a SYNTHETIC copy of the line): each replaces a draw once, so four cards from one draw (CR 614.5)', () => {
    const g = scenario()
      .define(bard)
      .seat(0)
      .battlefield(BARD, 'SYNTHETIC Draw Reign', 'Island')
      .hand(STUDY)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
  });
});
