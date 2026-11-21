// The Federation Fleet deck, group D (+1/+1 counters and the abilities around them): the REAL Oracle text of Ensign Harry Kim, Operations, Guinan, Ancient Advisor, Seven of Nine,
// Tertiary Adjunct and B'Elanna Torres, Scrapper (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario
// and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 118.3 and 602.2 (a cost), CR 122.1 and 122.6 (counters),
// CR 208.1 (power), CR 603.4 (an intervening "if"), CR 603.12 and 608.2c (a reflexive ability, what an instruction did), CR 701.20a (reveal), CR 701.9 (discard), CR 400.7 (a permanent that
// entered this turn), CR 302.6 (a {T} ability and summoning sickness).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const HARRY = real('Ensign Harry Kim, Operations');
const GUINAN = real('Guinan, Ancient Advisor');
const SEVEN = real('Seven of Nine, Tertiary Adjunct');
const BELANNA = real("B'Elanna Torres, Scrapper");

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const GOBLIN = 'Raging Goblin'; // 1/1, {R}
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const BOLT = 'Lightning Bolt';
const RING = 'Sol Ring';
const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '');
const FILLER = Array.from({ length: 8 }, () => 'Island');

describe('every card is valid', () => {
  test.each([
    ['Ensign Harry Kim, Operations', HARRY],
    ['Guinan, Ancient Advisor', GUINAN],
    ['Seven of Nine, Tertiary Adjunct', SEVEN],
    ["B'Elanna Torres, Scrapper", BELANNA],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Ensign Harry Kim, Operations: the trigger', () => {
  const board = (counters: number, hand: string, ...lands: string[]) =>
    scenario()
      .define(HARRY)
      .seat(0)
      .hand(hand)
      .library(...FILLER)
      .battlefield(HARRY.name, counters === 0 ? {} : { counters: { '+1/+1': counters } })
      .battlefield(...lands)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature with greater power than Harry gives him a +1/+1 counter (CR 208.1, 122.6)', () => {
    const g = board(0, BEARS, 'Forest', 'Forest');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(HARRY.name, { '+1/+1': 1 });
    g.expect.pt(HARRY.name, 2, 3);
    g.expect.invariants();
  });

  test('a creature with the same power gives him nothing: the comparison is of the power alone', () => {
    const g = board(0, GOBLIN, 'Mountain');
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
    g.expect.counters(HARRY.name, {});
    g.expect.noEvent({ kind: 'counterAdded' }, { since: 0 });
  });

  test('a creature with the same power and more toughness gives him nothing either (Evolve would)', () => {
    // Harry with one counter is a 2/3; Giant Spider is a 2/4.
    const g = board(1, SPIDER, 'Forest', 'Forest', 'Forest', 'Forest');
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.counters(HARRY.name, { '+1/+1': 1 });
  });

  test('his power counts the counters he has: with 2 counters he is a 3/4 and a 2/2 gives him nothing', () => {
    const g = board(2, BEARS, 'Forest', 'Forest');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(HARRY.name, { '+1/+1': 2 });
  });

  test('a creature an opponent controls does not trigger it', () => {
    const g = scenario()
      .define(HARRY)
      .seat(0)
      .library(...FILLER)
      .battlefield(HARRY.name)
      .seat(1)
      .library(...FILLER)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.counters(HARRY.name, {});
  });
});

describe('Ensign Harry Kim, Operations: the cost (CR 118.3, 122.1, 602.2)', () => {
  const board = (harry: number, bears: number, label = 'bears') =>
    scenario()
      .define(HARRY)
      .seat(0)
      .library(...FILLER)
      .battlefield(HARRY.name, harry === 0 ? {} : { counters: { '+1/+1': harry } })
      .battlefield(BEARS, bears === 0 ? { label } : { label, counters: { '+1/+1': bears } })
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two counters on Harry alone are removed without a question, and a card is drawn', () => {
    const g = board(2, 0);
    g.act(0).activate(HARRY.name, { pay: true });
    g.expect.counters(HARRY.name, {});
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('counters across two creatures: the player says which creature gives each one', () => {
    const g = board(2, 1);
    g.act(0).activate(HARRY.name, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect([d.purpose, d.forCost, d.min, d.max]).toEqual(['removeCountersCost', true, 1, 1]);
    g.act(0).choosePermanents('bears');
    // One counter is still owed and only Harry has one: nothing to choose, the engine takes it.
    g.expect.pending('priority', 0);
    g.expect.counters('bears', {});
    g.expect.counters(HARRY.name, { '+1/+1': 1 });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('exactly two counters among two creatures come off both, without a question', () => {
    const g = board(1, 1);
    g.act(0).activate(HARRY.name, { pay: true });
    g.expect.counters(HARRY.name, {});
    g.expect.counters('bears', {});
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('with one counter in all the ability is not offered', () => {
    const g = board(1, 0);
    expect(g.act(0).try.activate(HARRY.name).ok).toBe(false);
    g.expect.invariants();
  });
});

describe('Guinan, Ancient Advisor (CR 400.7, 122.6, 608.2c)', () => {
  /** Guinan and an old Grizzly Bears have been there since the turn began; `entering` Grizzly Bears are cast this turn, which are the ones that entered. */
  const turn = (entering: number) => {
    const g = scenario()
      .define(GUINAN)
      .seat(0)
      .hand(...Array.from({ length: entering }, () => BEARS))
      .library(...FILLER)
      .battlefield(GUINAN.name)
      .battlefield(BEARS, { label: 'old' })
      .battlefield(...Array.from({ length: 2 * entering + 1 }, () => 'Forest'))
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    for (let i = 0; i < entering; i += 1) {
      g.act(0).cast({ name: BEARS, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
      g.passAll();
    }
    return g;
  };

  test('each creature that entered this turn gets a counter, and two of them draw a card', () => {
    const g = turn(2);
    g.act(0).activate(GUINAN.name, { pay: true });
    g.passAll();
    const entered = g
      .find({ name: BEARS, zone: 'battlefield', seat: 0 })
      .filter((o) => o.counters['+1/+1'] === 1);
    expect(entered).toHaveLength(2);
    g.expect.counters('old', {});
    g.expect.counters('theirs', {});
    g.expect.counters(GUINAN.name, {});
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('one counter put draws nothing', () => {
    const g = turn(1);
    g.act(0).activate(GUINAN.name, { pay: true });
    g.passAll();
    const entered = g
      .find({ name: BEARS, zone: 'battlefield', seat: 0 })
      .filter((o) => o.counters['+1/+1'] === 1);
    expect(entered).toHaveLength(1);
    g.expect.counters('old', {});
    g.expect.handSize(0, 0);
  });

  test('no creature that entered this turn: no counter and no card', () => {
    const g = turn(0);
    g.act(0).activate(GUINAN.name, { pay: true });
    g.passAll();
    g.expect.counters('old', {});
    g.expect.handSize(0, 0);
    g.expect.noEvent({ kind: 'counterAdded' }, { since: 0 });
  });

  test('three creatures that entered this turn count as two or more', () => {
    const g = turn(3);
    g.act(0).activate(GUINAN.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('her own {T} cost needs her under control since the turn began (CR 302.6)', () => {
    const g = scenario()
      .define(GUINAN)
      .seat(0)
      .library(...FILLER)
      .battlefield(GUINAN.name, { fresh: true })
      .battlefield('Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    expect(g.act(0).try.activate(GUINAN.name).ok).toBe(false);
  });
});

describe('Seven of Nine, Tertiary Adjunct (CR 701.9, 603.12, 608.2c)', () => {
  const board = (hand: string[], library: string[]) =>
    scenario()
      .define(SEVEN)
      .define(TRINKET)
      .seat(0)
      .hand(...hand)
      .library(...library)
      .battlefield(SEVEN.name, TRINKET.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('discarding a nonland card puts two charge counters on the artifact the player targets', () => {
    const g = board([BOLT], ['Island', ...FILLER]);
    g.act(0).activate(SEVEN.name);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.act(0).chooseTargets(TRINKET.name);
    g.passAll();
    g.expect.counters(TRINKET.name, { charge: 2 });
    g.expect.counters(SEVEN.name, {});
    g.expect.invariants();
  });

  test('the target is "up to one": the player may pick none and nothing is put', () => {
    const g = board([BOLT], ['Island', ...FILLER]);
    g.act(0).activate(SEVEN.name);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters(TRINKET.name, {});
    g.expect.counters(SEVEN.name, {});
  });

  test('Seven herself is an artifact and may be the target', () => {
    const g = board([BOLT], ['Island', ...FILLER]);
    g.act(0).activate(SEVEN.name);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets(SEVEN.name);
    g.passAll();
    g.expect.counters(SEVEN.name, { charge: 2 });
  });

  test('discarding a land card makes no reflexive ability', () => {
    const g = board([BOLT], ['Island', ...FILLER]);
    g.act(0).activate(SEVEN.name);
    g.passAll();
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.passAll();
    g.expect.counters(TRINKET.name, {});
  });

  test('the card drawn this way may be the one discarded', () => {
    const g = board([], [BOLT, ...FILLER]);
    g.act(0).activate(SEVEN.name);
    g.passAll();
    // The only card in the hand is the one drawn: it is discarded with no question.
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.act(0).chooseTargets(TRINKET.name);
    g.passAll();
    g.expect.counters(TRINKET.name, { charge: 2 });
  });
});

describe("B'Elanna Torres, Scrapper (CR 701.20a, 608.2c, 122.6)", () => {
  const board = (top: string) =>
    scenario()
      .define(BELANNA)
      .seat(0)
      .library(top, 'Island', 'Island', ...FILLER)
      .battlefield(BELANNA.name, 'Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const surveilKeeping = (g: ReturnType<typeof board>, top: string) => {
    g.act(0).activate(BELANNA.name, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: [`${top}[0]`, 'Island[0]'] });
  };

  test('an artifact card revealed is drawn, and no counters are put', () => {
    const g = board(RING);
    surveilKeeping(g, RING);
    g.act(0).accept();
    g.expect.zone(RING, 'hand', { seat: 0 });
    g.expect.counters(BELANNA.name, {});
    g.expect.eventLog([{ kind: 'cardsRevealed', from: 'library' }]);
    g.expect.invariants();
  });

  test('another kind of card revealed is not drawn: two +1/+1 counters go on her', () => {
    const g = board(BEARS);
    surveilKeeping(g, BEARS);
    g.act(0).accept();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.counters(BELANNA.name, { '+1/+1': 2 });
    g.expect.handSize(0, 0);
  });

  test('declining to reveal draws nothing, so the counters are put', () => {
    const g = board(RING);
    surveilKeeping(g, RING);
    g.act(0).decline();
    g.expect.zone(RING, 'library', { seat: 0 });
    g.expect.noEvent({ kind: 'cardsRevealed' }, { since: 0 });
    g.expect.counters(BELANNA.name, { '+1/+1': 2 });
  });

  test('surveil 2 may put a card into the graveyard first, and the new top card is the one revealed', () => {
    const g = board(BEARS);
    g.act(0).activate(BELANNA.name, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'], other: [`${BEARS}[0]`] });
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.counters(BELANNA.name, { '+1/+1': 2 });
  });
});
