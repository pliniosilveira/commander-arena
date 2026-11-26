// "Whenever this creature enters or attacks, put a slime counter on up to one other target creature." / "Non-Horror creatures with slime counters on them lose all abilities and
// have base power and toughness 2/2." (Sludge Monster): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario
// and is played through applyAction, with 2, 3 and 4 seats.
// Pins (numbers as the code and docs already cite them; the CR text was not available here, so they are unchecked against it): CR 122.1 (counters), CR 613.1f (layer 6: abilities),
// CR 613.4b (layer 7b: base power and toughness), CR 613.4c (layer 7c: counters and modifications apply on top), CR 613.7 (timestamp order), CR 604.1 (a static ability), CR 611.3a (a
// static ability is not locked in), CR 115.1 ("up to one" target).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const ANGEL = 'Serra Angel'; // 4/4 flying, vigilance
const ELVES = 'Llanowar Elves'; // 1/1, {T}: Add {G}
const BEARS = 'Grizzly Bears';
const HORROR = 'SYNTHETIC Slime Horror';
const LORD = 'SYNTHETIC Slime Lord';

describe('Sludge Monster', () => {
  const sludge = real('Sludge Monster');
  const NAME = sludge.name;
  const horror = parsed(HORROR, 'Creature — Horror', 'Flying', { power: '3', toughness: '3' });
  const lord = parsed(LORD, 'Creature — Human', 'Other creatures you control get +1/+1.', {
    power: '2',
    toughness: '2',
  });

  test('the card is valid and says what the engine runs', () => {
    expect(validateCard(sludge)).toEqual([]);
    const group = { types: ['creature'], notSubtypes: ['Horror'], hasCounter: 'slime' };
    expect(sludge.faces[0]?.abilities.slice(2)).toEqual([
      {
        kind: 'static',
        static: { kind: 'loseAllAbilities', subject: { kind: 'filter', filter: group } },
      },
      {
        kind: 'static',
        static: {
          kind: 'setPt',
          subject: { kind: 'filter', filter: group },
          power: 2,
          toughness: 2,
        },
      },
    ]);
  });

  const table = (seats: 2 | 3 | 4) =>
    scenario({ seats }).define(sludge).define(horror).define(lord);

  test('it puts a slime counter on up to one other target creature when it enters: the creature loses its abilities and is 2/2', () => {
    const b = table(2);
    b.seat(0).hand(NAME).battlefield('Island', 'Island', 'Island', 'Island', 'Island');
    b.seat(0).library(...FILLER);
    b.seat(1)
      .battlefield(ANGEL)
      .library(...FILLER);
    const g = b.build();
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
    g.expect.pt(ANGEL, 4, 4);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: ANGEL, seat: 1 });
    g.passAll();
    g.expect.counters(ANGEL, { slime: 1 });
    g.expect.derived(ANGEL, { keywords: [] });
    g.expect.pt(ANGEL, 2, 2);
    // The Monster itself is a Horror: it keeps everything.
    g.expect.pt(NAME, 5, 5);
    g.expect.invariants();
  });

  test('"up to one": the trigger may have no target, and puts no counter', () => {
    const b = table(2);
    b.seat(0).hand(NAME).battlefield('Island', 'Island', 'Island', 'Island', 'Island');
    b.seat(0)
      .battlefield(BEARS)
      .library(...FILLER);
    b.seat(1).library(...FILLER);
    const g = b.build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.pt(BEARS, 2, 2);
  });

  test('the counter goes on another creature, never on the Monster itself', () => {
    const b = table(2);
    b.seat(0).hand(NAME).battlefield('Island', 'Island', 'Island', 'Island', 'Island');
    b.seat(0).library(...FILLER);
    b.seat(1)
      .battlefield(BEARS)
      .library(...FILLER);
    const g = b.build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    if (d?.kind !== 'targets') return;
    const legal = (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    expect(legal).toContain(g.id(BEARS));
    expect(legal).not.toContain(g.id(NAME));
  });

  test('base power and toughness are 2/2 and counters and modifiers apply on top (CR 613.4b, 613.4c)', () => {
    const b = table(2);
    b.seat(0)
      .battlefield(NAME)
      .battlefield(ANGEL, { counters: { slime: 1, '+1/+1': 2 } })
      .library(...FILLER);
    b.seat(1).library(...FILLER);
    const g = b.build();
    g.expect.pt(ANGEL, 4, 4);
    g.expect.derived(ANGEL, { keywords: [] });
  });

  test('an activated and a mana ability are lost: a creature with a slime counter cannot tap for mana', () => {
    const run = (counters: Record<string, number>) => {
      const b = table(2);
      b.seat(0)
        .battlefield(NAME)
        .battlefield(ELVES, { counters })
        .library(...FILLER);
      b.seat(1).library(...FILLER);
      return b.build();
    };
    expect(run({}).act(0).try.tapForMana(ELVES).ok).toBe(true);
    const slimed = run({ slime: 1 });
    // The scenario DSL says so when the creature has no mana ability left to tap.
    expect(() => slimed.act(0).try.tapForMana(ELVES)).toThrow(/has no mana ability/);
    slimed.expect.pt(ELVES, 2, 2);
  });

  test('a Horror with a slime counter is not affected', () => {
    const b = table(2);
    b.seat(0).battlefield(NAME);
    b.seat(1)
      .battlefield(HORROR, { counters: { slime: 1 } })
      .library(...FILLER);
    const g = b.build();
    g.expect.pt(HORROR, 3, 3);
    g.expect.derived(HORROR, { keywords: ['flying'] });
  });

  test('a creature without a slime counter, and a counter of another kind, change nothing', () => {
    const b = table(2);
    b.seat(0)
      .battlefield(NAME)
      .battlefield(ANGEL, { counters: { '+1/+1': 1 } });
    b.seat(1)
      .battlefield(BEARS, { counters: { charge: 2 } })
      .library(...FILLER);
    const g = b.build();
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
    g.expect.pt(ANGEL, 5, 5);
    g.expect.pt(BEARS, 2, 2);
  });

  test('the static abilities of an affected creature stop working too (CR 613.1f)', () => {
    const run = (slimed: boolean) => {
      const b = table(2);
      b.seat(0).battlefield(NAME).battlefield(BEARS);
      b.seat(0).battlefield(LORD, slimed ? { counters: { slime: 1 } } : {});
      b.seat(1).library(...FILLER);
      const g = b.build();
      return g;
    };
    // Without the counter the lord gives Grizzly Bears +1/+1; with it the lord is a vanilla 2/2.
    run(false).expect.pt(BEARS, 3, 3);
    const slimed = run(true);
    slimed.expect.pt(BEARS, 2, 2);
    slimed.expect.pt(LORD, 2, 2);
  });

  test('the effect is not locked in: it follows the board, and ends when the Monster leaves (CR 611.3a)', () => {
    const b = table(2);
    b.seat(0).hand('Lightning Bolt').battlefield('Mountain', NAME);
    b.seat(1)
      .battlefield(ANGEL, { counters: { slime: 1 } })
      .library(...FILLER);
    b.seat(0).library(...FILLER);
    const g = b.build();
    g.expect.pt(ANGEL, 2, 2);
    g.act(0).cast('Lightning Bolt', { targets: [{ name: NAME, seat: 0 }], pay: true });
    g.passAll();
    // The Monster is 5/5: it survives. Nothing changed.
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.pt(ANGEL, 2, 2);
  });

  test('the attack trigger puts a slime counter on another creature each time it attacks', () => {
    const b = table(2).at('precombatMain', { active: 0, turn: 3 });
    b.seat(0)
      .battlefield(NAME)
      .library(...FILLER);
    b.seat(1)
      .battlefield(ANGEL)
      .library(...FILLER);
    const g = b.build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: NAME, target: { player: 1 } }]);
    g.act(0).chooseTargets({ name: ANGEL, seat: 1 });
    g.passAll();
    g.expect.counters(ANGEL, { slime: 1 });
    g.expect.pt(ANGEL, 2, 2);
  });

  test.each([3, 4] as const)(
    '%i seats: the creatures of every opponent with a slime counter are affected, whoever controls them',
    (seats) => {
      const b = table(seats);
      b.seat(0).battlefield(NAME);
      b.seat(1).battlefield(ANGEL, { counters: { slime: 1 } });
      b.seat(2).battlefield(ANGEL, { counters: { slime: 1 } });
      if (seats === 4) b.seat(3).battlefield(ANGEL);
      const g = b.build();
      g.expect.pt({ name: ANGEL, seat: 1 }, 2, 2);
      g.expect.pt({ name: ANGEL, seat: 2 }, 2, 2);
      if (seats === 4) g.expect.pt({ name: ANGEL, seat: 3 }, 4, 4);
    },
  );
});
