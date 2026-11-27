// The Family Matters deck (issue 111), group A: the real Junk Winder, Rowdy Research, Jacked Rabbit and Zinnia, Valley's Voice (the golden corpus holds all four) go through the grammar
// with no override (NO_OVERRIDES), are validated, and are played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 702.41a (affinity for tokens counts the tokens of the caster), CR 111.1 and 603.2 (a token entering triggers "whenever a token you control enters"), CR 502.3 and 611.2a
// ("doesn't untap during its controller's next untap step"), CR 508.1 and 601.2f ("for each creature that attacked this turn": by any player, read as the cost is determined, each
// creature once), CR 508.4 (a creature put onto the battlefield attacking was never declared), CR 107.3m and 702.156a (Ravenous: the X of the spell is the counters and the draw reads
// X of 5 or more; 0 for a permanent that was not cast), CR 702.175a, 601.2b and 613.1f (offspring a static ability gives a spell as it is cast).
// The board is the engine's own fixtures (Grizzly Bears, Lightning Bolt, the basic lands). The CR text was not available: rule numbers are cited as the code already does.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const WINDER = real('Junk Winder');
const RESEARCH = real('Rowdy Research');
const RABBIT = real('Jacked Rabbit');
const ZINNIA = real("Zinnia, Valley's Voice");
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('all four cards are supported and validate', () => {
  test.each([WINDER, RESEARCH, RABBIT, ZINNIA])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Rowdy Research: "This spell costs {1} less to cast for each creature that attacked this turn."', () => {
  test('the lowering: a cost reduction of the spell by the creatures that attacked', () => {
    expect(RESEARCH.faces[0]?.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { kind: 'this' },
        amount: { kind: 'creaturesAttackedThisTurn' },
      },
    });
  });

  // {6}{U}: with four Islands and one attacker the cost is {5}{U}, so five more lands are needed; one attacker leaves it at six.
  const board = (lands: number) => {
    const g = scenario()
      .define(RESEARCH)
      .seat(0)
      .library(...LIBRARY)
      .hand(RESEARCH.name)
      .battlefield(BEARS, { label: 'bearA' })
      .battlefield(BEARS, { label: 'bearB' })
      .battlefield('Island', { count: lands })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('two attackers of the caster: {4}{U}, five Islands pay for it', () => {
    const g = board(5);
    g.act(0).attack(['bearA', 'bearB']);
    g.advanceTo('postcombatMain');
    g.act(0).cast(RESEARCH.name, { pay: true });
    g.passAll();
    g.expect.zone(RESEARCH.name, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('with no attacker it costs all seven: five Islands are not enough', () => {
    const g = board(5);
    g.act(0).noAttackers();
    g.advanceTo('postcombatMain');
    g.expect.illegal(0, { cast: RESEARCH.name });
  });

  test('a creature of another player that attacked counts too, each once (CR 508.1)', () => {
    const g = scenario()
      .define(RESEARCH)
      .seat(0)
      .library(...LIBRARY)
      .hand(RESEARCH.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1, turn: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS]);
    // The opponent's creature attacked: seat 0 casts it (an instant) for {5}{U} with six Islands.
    g.act(1).pass();
    g.act(0).cast(RESEARCH.name, { pay: true });
    g.passAll();
    g.expect.zone(RESEARCH.name, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
  });
});

describe('Jacked Rabbit: Ravenous and "Whenever this creature attacks, create a number of 1/1 white Rabbit creature tokens equal to this creature\'s power."', () => {
  test('the lowering: the keyword and the attack trigger', () => {
    const abilities = RABBIT.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual({ kind: 'keyword', keyword: { kind: 'ravenous' } });
    expect(abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
      }),
    );
  });

  const cast = (x: number, lands: number) => {
    const g = scenario()
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .hand(RABBIT.name)
      .battlefield('Plains', { count: lands })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(RABBIT.name, { x, pay: true });
    g.passAll();
    return g;
  };

  test('X of 3 enters with three +1/+1 counters and draws nothing', () => {
    const g = cast(3, 6);
    g.expect.counters(RABBIT.name, { '+1/+1': 3 });
    g.expect.pt(RABBIT.name, 4, 5);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('X of 5 enters with five counters and draws a card (CR 702.156a)', () => {
    const g = cast(5, 8);
    g.expect.counters(RABBIT.name, { '+1/+1': 5 });
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('X of 0 enters with no counter', () => {
    const g = cast(0, 2);
    g.expect.counters(RABBIT.name, {});
    g.expect.pt(RABBIT.name, 1, 2);
  });

  test('attacking makes as many tokens as its power', () => {
    const g = scenario()
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RABBIT.name, { counters: { '+1/+1': 2 } })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([RABBIT.name]);
    g.passAll();
    expect(g.find({ name: 'Rabbit', zone: 'battlefield' })).toHaveLength(3);
    g.expect.invariants();
  });

  test('put onto the battlefield without being cast it has X 0: no counters, no draw (CR 107.3g)', () => {
    const g = scenario()
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(RABBIT.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.counters(RABBIT.name, {});
    g.expect.handSize(0, 0);
  });
});

describe('Junk Winder: "Affinity for tokens" and the tap-and-freeze trigger', () => {
  test('the lowering: affinity counts tokens, the trigger sees a token you control enter', () => {
    const abilities = WINDER.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'affinity', filter: { token: true } },
    });
    expect(abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { token: true, controller: 'you' } },
      }),
    );
  });

  // Three Rabbit tokens made by an attack, then the Winder ({5}{U}{U} less three) from the hand after combat.
  const withTokens = (lands: number) => {
    const g = scenario()
      .define(WINDER)
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .hand(WINDER.name)
      .battlefield(RABBIT.name, { counters: { '+1/+1': 2 } })
      .battlefield('Island', { count: lands })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([RABBIT.name]);
    g.advanceTo('postcombatMain');
    return g;
  };

  test('three tokens make it {2}{U}{U}: four Islands cast it', () => {
    const g = withTokens(4);
    expect(g.find({ name: 'Rabbit', zone: 'battlefield' })).toHaveLength(3);
    g.act(0).cast(WINDER.name, { pay: true });
    g.passAll();
    g.expect.zone(WINDER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('without enough lands for what is left it cannot be cast', () => {
    const g = withTokens(3);
    g.expect.illegal(0, { cast: WINDER.name });
  });

  test('a token entering taps a nonland permanent of an opponent, which does not untap in its next untap step', () => {
    const g = scenario()
      .define(WINDER)
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WINDER.name)
      .battlefield(RABBIT.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield('Island', { label: 'theirIsland' })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([RABBIT.name]);
    // The Rabbit's attack trigger makes one token (power 1), which triggers the Winder: both players pass for each, in combat.
    for (let i = 0; i < 2; i += 1) {
      g.act(0).pass();
      g.act(1).pass();
    }
    const turn = g.state.turn.number;
    g.expect.stack([]);
    // One Rabbit token (power 1) entered: the trigger targets the only nonland permanent of the opponent.
    g.expect.tapped(BEARS, true);
    g.expect.tapped('theirIsland', false);
    // Their next untap step does not untap it; the one after does.
    g.advanceTo('upkeep', { turn: turn + 1 });
    g.expect.step('upkeep', { active: 1, turn: turn + 1 });
    g.expect.tapped(BEARS, true);
    g.advanceTo('upkeep', { turn: turn + 3 });
    g.expect.step('upkeep', { active: 1, turn: turn + 3 });
    g.expect.tapped(BEARS, false);
    g.expect.invariants();
  });
});

describe('Zinnia, Valley\'s Voice: "Creature spells you cast gain offspring {2} as you cast them."', () => {
  test('the lowering: the grant of offspring to creature spells, and the pump by base power 1', () => {
    const abilities = ZINNIA.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: { types: ['creature'], controller: 'you' },
        keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['2'] }] },
      },
    });
  });

  const board = (lands: number) =>
    scenario()
      .define(ZINNIA)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(ZINNIA.name)
      .battlefield('Forest', { count: lands })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the question is asked with the cost; paying it makes a 1/1 token copy when the creature enters', () => {
    const g = board(4);
    g.act(0).cast(BEARS);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
    const token = g.find({ name: BEARS, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token).toBeDefined();
    if (token !== undefined) g.expect.pt(token.id, 1, 1);
    g.expect.invariants();
  });

  test('declining casts it for its own cost and makes no token', () => {
    const g = board(4);
    g.act(0).cast(BEARS);
    g.act(0).decline();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
  });

  test('with too few lands the question is not asked', () => {
    const g = board(2);
    g.act(0).cast(BEARS);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
  });

  test('the cost is paid once and the spell remembers it as given (CR 702.175a)', () => {
    const g = board(8);
    const mark = g.mark();
    g.act(0).cast(BEARS);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    const spell = g.find({ name: BEARS, zone: 'stack' })[0];
    expect(spell?.stack?.offspringPaid).toBe(true);
    expect(spell?.stack?.offspringGranted).toBe(true);
    const cast = g.eventsSince(mark).find((e) => e.kind === 'spellCast');
    expect(cast?.kind === 'spellCast' && cast.offspring).toBe(true);
    g.expect.invariants();
  });

  test('the token still comes when Zinnia has left before the creature enters (the spell remembers the grant)', () => {
    const g = scenario()
      .define(ZINNIA)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(ZINNIA.name)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BEARS);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [ZINNIA.name], pay: true });
    g.passAll();
    g.expect.zone(ZINNIA.name, 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
    g.expect.invariants();
  });

  test('a spell with no grant (the opponent casts a creature) is not asked', () => {
    const g = scenario()
      .define(ZINNIA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ZINNIA.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield('Forest', { count: 4 })
      .at('precombatMain', { active: 1, turn: 1 })
      .build();
    g.act(1).cast(BEARS);
    g.expect.pending('payMana', 1);
  });
});

describe('Zinnia: "+X/+0, where X is the number of other creatures you control with base power 1"', () => {
  test('counts the other creatures of base power 1, not those with a counter that only raises the power', () => {
    const g = scenario()
      .define(ZINNIA)
      .define(RABBIT)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ZINNIA.name)
      .battlefield(RABBIT.name, { counters: { '+1/+1': 2 }, label: 'rabbit' })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(RABBIT.name, { label: 'theirRabbit' })
      .build();
    // Zinnia is 1/3; one other creature of mine has base power 1 (the Rabbit, whatever counters it has); the Bears' base power is 2; the opponent's Rabbit is not mine.
    g.expect.pt(ZINNIA.name, 2, 3);
    g.expect.invariants();
  });
});
