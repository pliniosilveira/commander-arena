// Parsed text is only worth something if the engine runs it as written (stage P26). These tests import SYNTHETIC cards
// through the grammar (never through a fixture), define them in an engine scenario and play them through applyAction:
// the cast-later slice of D-128 (ENGINE_VERSION 26): Suspend (CR 702.62a: exile with time counters, one removed each
// upkeep, a free cast with haste when the last is gone), Madness (CR 702.35a: a discarded card is exiled and may be
// cast for its madness cost), Foretell (CR 702.143a: {2} to exile it face down, a later cast for the foretell cost)
// and the delayed draw (CR 603.7: at the beginning of the next turn's upkeep). Every card name starts with
// "SYNTHETIC"; the lines are the real ones of reports/templates.json ("Suspend N—{M}", "Madness {M}", "Foretell {M}",
// "You draw a card at the beginning of the next turn's upkeep."), the costs and the bodies are SYNTHETIC. No real
// card's text is claimed.
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

/** Seat 0's precombat main phase of turn 3 with `place` applied to seat 0; libraries that do not run out. */
function game(place: (b: Builder) => Builder): Game {
  return place(scenario().seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const resolveTop = (g: Game): void => {
  g.pass();
  g.pass();
};

const exiled = (g: Game, name: string) => {
  const [card] = g.find({ name, zone: 'exile' });
  if (card === undefined) throw new Error(`${name} is not in exile`);
  return card;
};

const toMyUpkeep = (g: Game): void => {
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
};

describe('"Suspend N—{M}" (backlog: 65 cards; CR 702.62a)', () => {
  const BEAR = parsed('SYNTHETIC Parsed Suspend Bear', 'Creature — Bear', 'Suspend 2—{G}', {
    manaCost: '{2}{G}',
    power: '3',
    toughness: '3',
    colors: ['G'],
  });
  const name = BEAR.name;
  const withBear = (b: Builder) => b.define(BEAR).hand(name).battlefield('Forest', { count: 3 });

  test('the lowering is the engine keyword with its count and cost', () => {
    expect(BEAR.faces[0]?.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'suspend', count: 2, cost: [{ kind: 'mana', symbols: ['G'] }] },
      },
    ]);
  });

  test('the special action pays the cost and exiles the card with the counters, without the stack', () => {
    const g = game(withBear);
    g.expect.legal(0, { suspend: name });
    g.act(0).suspend(name, { pay: true });
    g.expect.zone(name, 'exile', { seat: 0 });
    g.expect.counters(exiled(g, name).id, { time: 2 });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a counter comes off at each of the owner’s upkeeps, and with the last one the card is cast for free', () => {
    const g = game(withBear);
    g.act(0).suspend(name, { pay: true });
    toMyUpkeep(g);
    resolveTop(g);
    g.expect.counters(exiled(g, name).id, { time: 1 });
    toMyUpkeep(g);
    resolveTop(g);
    g.expect.counters(exiled(g, name).id, {});
    g.expect.stack([`${name} (ability)`]);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.purpose).toBe('suspend');
    g.act(0).accept();
    g.expect.stack([name]);
    resolveTop(g);
    g.expect.zone(name, 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === name)?.keywords).toContain(
      'haste',
    );
    g.expect.invariants();
  });

  test('declining the free cast leaves the card in exile with no counters', () => {
    const g = game(withBear);
    g.act(0).suspend(name, { pay: true });
    for (let i = 0; i < 2; i += 1) {
      toMyUpkeep(g);
      resolveTop(g);
    }
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(name, 'exile', { seat: 0 });
    g.expect.counters(exiled(g, name).id, {});
  });

  test('a SYNTHETIC sorcery with Suspend and spell text is suspended and cast for free, then does what it says', () => {
    const INSIGHT = parsed(
      'SYNTHETIC Parsed Suspend Insight',
      'Sorcery',
      'Draw two cards.\nSuspend 1—{U}',
      { manaCost: '{2}{U}', colors: ['U'] },
    );
    const g = game((b) => b.define(INSIGHT).hand(INSIGHT.name).battlefield('Island', { count: 3 }));
    g.act(0).suspend(INSIGHT.name, { pay: true });
    toMyUpkeep(g);
    resolveTop(g);
    resolveTop(g);
    g.act(0).accept();
    g.expect.stack([INSIGHT.name]);
    g.expect.handSize(0, 0); // the spell is on the stack: it has not resolved
    resolveTop(g);
    g.expect.handSize(0, 2);
    g.expect.zone(INSIGHT.name, 'graveyard', { seat: 0 });
  });
});

describe('"Madness {M}" (backlog: 56 cards; CR 702.35a)', () => {
  const FIEND = parsed('SYNTHETIC Parsed Madness Fiend', 'Creature — Imp', 'Madness {1}{B}', {
    manaCost: '{3}{B}',
    power: '4',
    toughness: '3',
    colors: ['B'],
  });
  const ROT = parsed('SYNTHETIC Parsed Mind Rot', 'Sorcery', 'Each opponent discards a card.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const name = FIEND.name;

  /** Seat 0 casts Mind Rot on seat 1, who holds the Fiend and two Swamps; the spell has resolved. */
  function rotted(): Game {
    const g = game((b) =>
      b
        .define(ROT)
        .hand(ROT.name)
        .battlefield('Swamp')
        .seat(1)
        .define(FIEND)
        .hand(name)
        .battlefield('Swamp', { count: 2 })
        .seat(0),
    );
    g.act(0).cast(ROT.name, { pay: true });
    resolveTop(g);
    return g;
  }

  test('the lowering is an alternative cost of the face, not an ability', () => {
    expect(FIEND.faces[0]?.alternativeCosts).toEqual([
      { kind: 'madness', cost: [{ kind: 'mana', symbols: ['1', 'B'] }] },
    ]);
    expect(FIEND.faces[0]?.abilities).toEqual([]);
  });

  test('a discarded card goes to exile, and its owner may cast it for the madness cost', () => {
    const g = rotted();
    g.expect.zone(name, 'exile', { seat: 1 });
    g.expect.noObject(name, { zone: 'graveyard' });
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.purpose).toBe('madness');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'B'] }]);
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.stack([name]);
    resolveTop(g);
    g.expect.zone(name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('declining puts it into the graveyard', () => {
    const g = rotted();
    resolveTop(g);
    g.act(1).decline();
    g.expect.zone(name, 'graveyard', { seat: 1 });
  });

  test('it is never cast from the hand for the madness cost', () => {
    const g = game((b) => b.define(FIEND).hand(name).battlefield('Swamp', { count: 4 }));
    g.expect.illegal(0, { cast: name, alternative: 'madness' });
  });
});

describe('"Foretell {M}" (backlog: 50 cards; CR 702.143a)', () => {
  const GIFT = parsed(
    'SYNTHETIC Parsed Foretold Gift',
    'Instant',
    'Draw two cards.\nForetell {U}',
    {
      manaCost: '{3}{U}',
      colors: ['U'],
    },
  );
  const name = GIFT.name;
  const withGift = (b: Builder) => b.define(GIFT).hand(name).battlefield('Island', { count: 4 });

  test('the lowering is an alternative cost of the face, not an ability', () => {
    expect(GIFT.faces[0]?.alternativeCosts).toEqual([
      { kind: 'foretell', cost: [{ kind: 'mana', symbols: ['U'] }] },
    ]);
    expect(GIFT.faces[0]?.abilities).toEqual([]);
  });

  test('{2} exiles the card face down; later it is cast for the foretell cost', () => {
    const g = game(withGift);
    g.expect.legal(0, { foretell: name });
    g.act(0).foretell(name, { pay: true });
    g.expect.zone(name, 'exile', { seat: 0 });
    expect(getView(g.state, 1).exile.find((o) => o.owner === 0)?.name).toBe('Face-down card');
    g.expect.illegal(0, { cast: name, alternative: 'foretell' }); // not in the turn it was foretold
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.legal(0, { cast: name, alternative: 'foretell' });
    const before = g.state.battlefield.filter((id) => g.state.objects[id]?.tapped).length;
    g.act(0).cast(name, { alternative: 'foretell', pay: true });
    // The foretell cost is {U}: one Island, not the four of the mana cost.
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped).length - before).toBe(1);
    g.expect.stack([name]);
    g.expect.invariants();
  });
});

describe('"You draw a card at the beginning of the next turn\'s upkeep." (backlog: 1 card; CR 603.7)', () => {
  const FUTURE = parsed(
    'SYNTHETIC Parsed Future Sight',
    'Sorcery',
    "You draw a card at the beginning of the next turn's upkeep.",
    { manaCost: '{U}', colors: ['U'] },
  );
  const HASTE_DRAW = parsed(
    'SYNTHETIC Parsed Delayed Gift',
    'Instant',
    "Draw a card at the beginning of the next turn's upkeep.",
    { manaCost: '{U}', colors: ['U'] },
  );

  test('the lowering is a delayed trigger at the upkeep of each turn whose effect is the draw', () => {
    for (const card of [FUTURE, HASTE_DRAW]) {
      expect(card.faces[0]?.spell?.effect).toEqual({
        kind: 'delayedTrigger',
        at: { step: 'upkeep', whose: 'each' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      });
    }
  });

  test('nothing is drawn as the spell resolves; the next upkeep, whoever’s, draws for its controller', () => {
    const g = game((b) => b.define(FUTURE).hand(FUTURE.name).battlefield('Island'));
    g.act(0).cast(FUTURE.name, { pay: true });
    resolveTop(g);
    g.expect.handSize(0, 0);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.expect.stack([`${FUTURE.name} (ability)`]);
    resolveTop(g);
    g.expect.handSize(0, 1);
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('the imperative form does the same for its controller', () => {
    const g = game((b) => b.define(HASTE_DRAW).hand(HASTE_DRAW.name).battlefield('Island'));
    g.act(0).cast(HASTE_DRAW.name, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    resolveTop(g);
    g.expect.handSize(0, 1);
  });
});
