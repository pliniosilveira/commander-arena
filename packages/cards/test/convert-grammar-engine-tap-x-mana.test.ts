// "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom), imported through the grammar and played through applyAction.
// The card is SYNTHETIC (its name starts with "SYNTHETIC"); the wording is that of the real card, taken from the card data of deck support issue 113 (golden corpus). Pins: CR 107.3 and
// 605.3b (X is chosen as the ability is activated, by naming the permanents), CR 106.1b (any combination of the five colors), CR 302.6 (the creature's own {T} needs a turn under its
// controller's control; a fresh token may be tapped for the cost), CR 119.4 (life), CR 605.3a (the mana pays a spell).
import { type Action, getLegalActions, type ObjectId, type SeatId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const HAZEL_TEXT =
  "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.\nAt the beginning of your end step, create a token that's a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it.";
const HAZEL = parsed('SYNTHETIC Parsed Hazel', 'Legendary Creature — Squirrel Druid', HAZEL_TEXT, {
  manaCost: '{2}{B}{G}',
  colors: ['B', 'G'],
  power: '3',
  toughness: '5',
});
const SWARM = parsed(
  'SYNTHETIC Parsed Swarm',
  'Sorcery',
  'Create three 1/1 green Squirrel creature tokens.',
  { manaCost: '{G}', colors: ['G'] },
);
const RITE = parsed('SYNTHETIC Parsed Rite', 'Sorcery', 'You gain 3 life.', {
  manaCost: '{W}{U}{B}',
  colors: ['W', 'U', 'B'],
});
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const tokensOf = (g: ScenarioGame, seat: SeatId): ObjectId[] =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o !== undefined && o.token !== null && o.controller === seat;
  });

const tapAction = (g: ScenarioGame, many: readonly ObjectId[], combination: string): Action => ({
  kind: 'activateAbility',
  source: g.id(HAZEL.name),
  abilityIndex: 0,
  color: null,
  combination: [...combination] as never,
  tappedMany: many,
});

function board(hazel: { fresh?: boolean } = {}): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(20)
    .define(HAZEL)
    .define(SWARM)
    .define(RITE)
    .battlefield(HAZEL.name, hazel)
    .battlefield('Forest')
    .hand(SWARM.name, RITE.name)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(SWARM.name, { pay: true });
  g.passAll();
  return g;
}

describe('the real text is supported and runs', () => {
  test('both of her abilities are read: the mana ability has the cost and the production of X', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Hazel Again',
        manaCost: '{2}{B}{G}',
        typeLine: 'Legendary Creature — Squirrel Druid',
        oracleText: HAZEL_TEXT,
        power: '3',
        toughness: '5',
      }),
    );
    expect(imported.support.status).toBe('supported');
    const mana = imported.definition.faces[0]?.abilities?.find((a) => a.kind === 'mana');
    expect(mana).toMatchObject({
      cost: [
        { kind: 'tap' },
        { kind: 'payLife', amount: 2 },
        { kind: 'tapPermanentsX', filter: { token: true, controller: 'you' } },
      ],
      production: { kind: 'anyCombinationTapped' },
    });
  });

  test.each([
    // X in the cost of an ordinary ability has no way to be run: not read.
    '{T}, Tap X untapped tokens you control: Draw a card.',
    // Two definitions of X, or a production that is not "X mana in any combination of colors".
    '{T}, Tap X untapped tokens you control: Add X mana in any combination of colors, where X is the number of creatures you control.',
    '{T}, Tap X untapped tokens you control: Add X mana of any one color.',
    '{T}, Tap X untapped tokens you control, Sacrifice an artifact: Add X mana in any combination of colors.',
    // The production with no cost that gives X.
    '{T}: Add X mana in any combination of colors.',
  ])('%s is not read', (text) => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed No Hazel',
        manaCost: '{2}{G}',
        typeLine: 'Creature — Squirrel',
        oracleText: text,
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test('X = 3 of 3 tokens, mixed colors: the three mana pay a spell of three colors; Hazel and the tokens are tapped; 2 life paid', () => {
    const g = board();
    const tokens = tokensOf(g, 0);
    expect(tokens).toHaveLength(3);
    g.choose(0, tapAction(g, tokens, 'WUB'));
    g.expect.pool(0, 'WUB');
    g.expect.life(0, 18);
    g.expect.tapped(HAZEL.name, true);
    for (const id of tokens) expect(g.state.objects[id]?.tapped).toBe(true);
    g.act(0).cast(RITE.name, { pay: true });
    g.passAll();
    g.expect.life(0, 21);
    g.expect.invariants();
  });

  test('X = 1 of 3: the other two tokens stay untapped', () => {
    const g = board();
    const [first, ...rest] = tokensOf(g, 0);
    if (first === undefined) throw new Error('no tokens');
    g.choose(0, tapAction(g, [first], 'R'));
    g.expect.pool(0, 'R');
    expect(rest.every((id) => g.state.objects[id]?.tapped === false)).toBe(true);
  });

  test('the options of the priority decision tap every token, with a few combinations of that many mana', () => {
    const g = board();
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'activateAbility' && a.source === g.id(HAZEL.name),
    );
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.kind === 'activateAbility' && o.tappedMany).toEqual(tokensOf(g, 0));
    }
  });

  test('Hazel cast this turn cannot pay her own {T} (CR 302.6), though the tokens she taps may be as new', () => {
    const g = board({ fresh: true });
    const before = g.positionHash();
    expect(g.act(0).try.action(tapAction(g, tokensOf(g, 0), 'WUB')).ok).toBe(false);
    g.expect.position(before);
  });

  test('another player’s tokens are never tapped for her', () => {
    const g = board();
    const before = g.positionHash();
    const theirs = g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 1);
    expect(g.act(0).try.action(tapAction(g, theirs.slice(0, 1), 'W')).ok).toBe(false);
    g.expect.position(before);
  });
});
