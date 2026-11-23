// The Limit Break deck, group G5: the REAL Oracle text of SOLDIER Military Program and Summon: Kujata (the corpus's golden.jsonl) goes through the grammar as a card with no override, is
// defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Every scenario has three seats, so the
// "each opponent" of chapter III is more than one player.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

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

const PROGRAM = 'SOLDIER Military Program';
const KUJATA = 'Summon: Kujata';
const BEARS = 'Grizzly Bears';
const ACE = 'Fencing Ace'; // a 1/1 Soldier
const SPIDER = 'Giant Spider';

describe('the grammar: "choose one. If you control a commander, you may choose both instead." (CR 700.2, 700.2b, 903.3d)', () => {
  const LEAD =
    'At the beginning of combat on your turn, choose one. If you control a commander, you may choose both instead.';
  const BULLETS = '• You gain 3 life.\n• Draw a card.';

  test('a triggered ability reads it as a choice of one that widens to both while a commander is controlled', () => {
    const [ability] = readAll(`${LEAD}\n${BULLETS}`, 'enchantment').abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      chooseModes: {
        min: 1,
        max: 1,
        maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
      },
    });
  });

  test('"both" is two modes: three bullets are refused', () => {
    const u = dropped(`${LEAD}\n${BULLETS}\n• Scry 1.`, 'enchantment');
    expect(u).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'modal.choose-commander-trigger',
    });
  });

  test('a spell does not say it without "as you cast ~": the line is not read', () => {
    const text = `Choose one. If you control a commander, you may choose both instead.\n${BULLETS}`;
    expect(read(text, 'instant').unparsed).not.toEqual([]);
  });
});

describe('the grammar: "each of up to two Soldiers you control" is a choice, not a target (CR 608.2d)', () => {
  test('the counters go to the permanents the controller chooses as the effect resolves', () => {
    const [ability] = readAll(
      'At the beginning of your end step, put a +1/+1 counter on each of up to two Soldiers you control.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'chooseObjects',
            filter: { subtypes: ['Soldier'], controller: 'you' },
            count: 2,
          },
          { kind: 'addCounters', counter: '+1/+1', count: 1 },
        ],
      },
    });
    // "up to": choosing fewer is allowed, so it is not `exactly`.
    expect(JSON.stringify(ability)).not.toContain('"exactly"');
  });

  test('a choice among permanents of another player is not read', () => {
    expect(
      read(
        'At the beginning of your end step, put a +1/+1 counter on each of up to two Soldiers.',
        'enchantment',
      ).unparsed,
    ).not.toEqual([]);
  });
});

describe('the grammar: a Saga chapter with a name of its own (CR 714.2)', () => {
  test('"I — Lightning — ..." is the chapter ability of its text', () => {
    const [ability] = readAll(
      'I — Lightning — You gain 3 life.\nII — Ice — Draw a card.',
      'enchantment',
      ['Saga'],
    ).abilities;
    expect(ability).toMatchObject({ kind: 'triggered', trigger: { kind: 'chapter', from: 1 } });
  });

  test('a name of three words, or in lower case, is not dropped silently: the line is not read', () => {
    expect(
      read('I — the Big Bang Theory — You gain 3 life.', 'enchantment', ['Saga']).unparsed,
    ).not.toEqual([]);
  });
});

describe('SOLDIER Military Program: the choice at the beginning of combat on your turn (CR 700.2b, 603.3c)', () => {
  const program = real(PROGRAM);

  const board = (commander: boolean, soldiers = 0, active = 0) => {
    const b = scenario({ seats: 3 })
      .define(program)
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(PROGRAM);
    if (commander) b.battlefield(BEARS, { commander: true });
    for (let i = 0; i < soldiers; i++) b.battlefield(ACE, { label: `S${i}` });
    return b
      .seat(1)
      .library('Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains')
      .at('precombatMain', { active })
      .build();
  };

  test('is valid', () => {
    expect(validateCard(program)).toEqual([]);
  });

  test('without a commander only one mode may be chosen', () => {
    const g = board(false);
    g.advanceTo('beginningOfCombat');
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected chooseModes, got ${d?.kind}`);
    expect(d.sets).toEqual([[0], [1]]);
  });

  test('with a commander both may be chosen as well', () => {
    const g = board(true);
    g.advanceTo('beginningOfCombat');
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected chooseModes, got ${d?.kind}`);
    expect(d.sets).toEqual([[0], [1], [0, 1]]);
  });

  test('the first mode creates a 1/1 white Soldier creature token', () => {
    const g = board(false);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(0);
    g.passAll();
    const soldiers = g.find({ name: 'Soldier', zone: 'battlefield', seat: 0 });
    expect(soldiers).toHaveLength(1);
    const [token] = soldiers;
    if (token === undefined) throw new Error('no Soldier token');
    expect(token.token).not.toBeNull();
    g.expect.pt(token.id, 1, 1);
    expect(token.token?.characteristics.colors).toEqual(['W']);
    expect(token.token?.characteristics.subtypes).toEqual(['Soldier']);
    g.expect.invariants();
  });

  test('the second mode puts a +1/+1 counter on each of up to two Soldiers: the controller chooses, three Soldiers', () => {
    const g = board(false, 3);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    // Not a target: three Soldiers could be chosen among, and at most two are.
    expect(() => g.act(0).choosePermanents('S0', 'S1', 'S2')).toThrow();
    g.act(0).choosePermanents('S0', 'S2');
    g.expect.counters('S0', { '+1/+1': 1 });
    g.expect.counters('S2', { '+1/+1': 1 });
    expect(g.object(g.id('S1')).counters['+1/+1']).toBeUndefined();
    g.expect.invariants();
  });

  test('"up to": fewer may be chosen, and a creature that is not a Soldier is not offered', () => {
    const g = board(false, 1);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(1);
    g.passAll();
    g.act(0).choosePermanents('S0');
    g.expect.counters('S0', { '+1/+1': 1 });
    const h = board(false, 1);
    h.advanceTo('beginningOfCombat');
    h.act(0).chooseModes(1);
    h.passAll();
    expect(() => h.act(0).choosePermanents(PROGRAM)).toThrow();
  });

  test('with a commander both modes are chosen: a token, and counters on up to two Soldiers (in printed order)', () => {
    const g = board(true, 1);
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(0, 1);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('S0');
    expect(g.find({ name: 'Soldier', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.counters('S0', { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('a commander in the command zone does not widen the choice (CR 903.3d: it must be controlled)', () => {
    const g = scenario({ seats: 3 })
      .define(program)
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(PROGRAM)
      .command(BEARS, { commander: true })
      .seat(1)
      .library('Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected chooseModes, got ${d?.kind}`);
    expect(d.sets).toEqual([[0], [1]]);
  });

  test('on an opponent turn the ability does not trigger (three seats)', () => {
    const g = board(true, 0, 1);
    g.advanceTo('beginningOfCombat');
    expect(g.state.pending?.kind).not.toBe('chooseModes');
    g.expect.stack([]);
  });
});

describe('Summon: Kujata: a creature Saga (CR 714, 702.19, 702.10)', () => {
  const kujata = real(KUJATA);

  /** Seat 0 has Kujata on the battlefield with `lore` counters at its draw step: the precombat main phase adds the next one (CR 714.3b). */
  const saga = (lore: number, hand: readonly string[] = []) => {
    const b = scenario({ seats: 3 })
      .define(kujata)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(KUJATA, { counters: { lore } })
      .seat(1)
      .library('Plains', 'Plains')
      .battlefield(BEARS)
      .seat(2)
      .library('Plains', 'Plains')
      .battlefield(SPIDER);
    if (hand.length > 0) b.seat(0).hand(...hand);
    return b.at('draw', { active: 0 }).build();
  };

  test('is valid, a 7/5 with trample and haste', () => {
    expect(validateCard(kujata)).toEqual([]);
    const face = kujata.faces[0];
    expect(face?.types).toEqual(['enchantment', 'creature']);
    expect(face?.subtypes).toEqual(['Saga', 'Ox']);
    expect(face?.finalChapter).toBe(3);
    expect(face?.power).toBe(7);
    expect(face?.toughness).toBe(5);
  });

  test("chapter I deals 3 damage to each of up to two target creatures, any player's", () => {
    const g = scenario({ seats: 3 })
      .define(kujata)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .hand(KUJATA)
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .library('Plains', 'Plains')
      .battlefield(BEARS)
      .seat(2)
      .library('Plains', 'Plains')
      .battlefield(SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(KUJATA, { pay: true });
    g.passAll();
    // The Saga enters with a lore counter: chapter I triggers and asks for its targets.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // The Spider is a 2/4: three damage does not kill it.
    g.expect.zone(SPIDER, 'battlefield', { seat: 2 });
    g.expect.damage(SPIDER, 3);
    g.expect.invariants();
  });

  test("chapter II: a target creature can't block this turn, so the defending player gets no block decision (CR 509.1b)", () => {
    const g = saga(1);
    g.advanceTo('precombatMain');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: KUJATA, target: { player: 1 } }]);
    g.passAll();
    // The Bears are the only creature seat 1 has, and it cannot block: nothing to decide.
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
    g.expect.invariants();
  });

  test('chapter II without that target: the same creature may block', () => {
    const g = saga(1);
    g.advanceTo('precombatMain');
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: KUJATA, target: { player: 1 } }]);
    g.passAll();
    g.expect.pending('declareBlockers', 1);
  });

  test('chapter III: discards a card, draws two, and deals its mana value to every opponent (three seats)', () => {
    const g = saga(2, [SPIDER]);
    g.advanceTo('precombatMain');
    g.passAll();
    // The one card in hand is discarded (a Giant Spider, mana value 4), then two cards are drawn.
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    // The reflexive ability resolves: each of the two opponents takes 4.
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 36);
    g.expect.life(2, 36);
    // CR 714.4: a Saga with the final chapter's ability resolved is sacrificed.
    g.expect.zone(KUJATA, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('chapter III with an empty hand discards nothing: no damage is dealt, and two cards are still drawn', () => {
    const g = saga(2);
    g.advanceTo('precombatMain');
    g.passAll();
    g.expect.handSize(0, 2);
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
    g.expect.invariants();
  });

  test('the mana value is the one of the card discarded: a land is worth 0 (CR 202.3)', () => {
    const g = saga(2, ['Mountain']);
    g.advanceTo('precombatMain');
    g.passAll();
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });
});
