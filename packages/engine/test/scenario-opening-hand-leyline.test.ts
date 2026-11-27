// "If this card is in your opening hand, you may begin the game with it on the battlefield." (CR 103.6, the Leylines): after the mulligans and before the first turn, starting with
// the starting player in turn order, each player is asked about each such card in their hand. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type DeckConfig, deckOf, type PendingDecision } from '../src/index';
import { type ScenarioGame, startGame } from '../src/testing/index';

const LEYLINE = 'SYNTHETIC Opening Leyline';
const leyline = singleFace({
  name: LEYLINE,
  manaCost: ['U', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'If this card is in your opening hand, you may begin the game with it on the battlefield.',
  abilities: [{ kind: 'static', static: { kind: 'beginGameOnBattlefield' } }],
});

function deck(commander: string, filler: 'leyline' | 'land'): DeckConfig {
  const rest =
    filler === 'leyline' ? Array.from({ length: 99 }, () => leyline) : deckOf([['Island', 99]]);
  return { cards: [...deckOf([[commander, 1]]), ...rest], commanders: [0] };
}

const start = (second: 'leyline' | 'land') =>
  startGame({
    seed: 3,
    decks: [deck('Isamaru, Hound of Konda', 'leyline'), deck('Yargle, Glutton of Urborg', second)],
  });

const pending = (g: ScenarioGame): PendingDecision | null => g.state.pending;
const onBattlefield = (g: ScenarioGame, seat: number): number =>
  g.state.battlefield.filter((id) => g.state.objects[id]?.controller === seat).length;

function keepAll(g: ScenarioGame): void {
  g.act(g.state.turn.activeSeat).keep();
  g.act(1 - g.state.turn.activeSeat).keep();
}

describe('CR 103.6: begin the game with it on the battlefield', () => {
  test('after the last keep the holder is asked, with the card as the source', () => {
    const g = start('land');
    keepAll(g);
    const d = pending(g);
    if (d?.kind !== 'confirmOptional' || d.purpose !== 'openingHand') {
      throw new Error(`expected the opening-hand question, got ${d?.kind}`);
    }
    expect(d.sourceName).toBe(LEYLINE);
    expect(g.state.turn.number).toBe(0);
    expect(g.legalActions(d.seat).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'concede',
    ]);
  });

  test('accepting puts the card onto the battlefield; declining leaves it in hand; then the first turn begins', () => {
    const g = start('land');
    const first = g.state.turn.activeSeat;
    keepAll(g);
    const holder = 0; // the only deck with such cards
    g.act(holder).accept();
    for (let i = 0; i < 6; i += 1) g.act(holder).decline();
    g.expect.step('upkeep', { active: first, turn: 1 });
    expect(onBattlefield(g, holder)).toBe(1);
    expect(g.state.seats[holder]?.hand).toHaveLength(6);
    expect(onBattlefield(g, 1 - holder)).toBe(0);
    g.expect.invariants();
  });

  test('every player is asked in turn order from the starting player', () => {
    const g = start('leyline');
    const first = g.state.turn.activeSeat;
    keepAll(g);
    const seen: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const d = pending(g);
      if (d?.kind !== 'confirmOptional' || d.purpose !== 'openingHand') break;
      seen.push(d.seat);
      g.act(d.seat).accept();
    }
    expect(seen).toEqual([...Array(7).fill(first), ...Array(7).fill(1 - first)]);
    expect(onBattlefield(g, first)).toBe(7);
    expect(onBattlefield(g, 1 - first)).toBe(7);
    g.expect.step('upkeep', { active: first, turn: 1 });
  });

  test('no such card in any hand: the first turn begins at once', () => {
    const g = startGame({
      seed: 3,
      decks: [deck('Isamaru, Hound of Konda', 'land'), deck('Yargle, Glutton of Urborg', 'land')],
    });
    keepAll(g);
    g.expect.step('upkeep', { active: g.state.turn.activeSeat, turn: 1 });
  });
});

describe('the answer is checked', () => {
  test('only the seat asked may answer', () => {
    const g = start('land');
    keepAll(g);
    const d = pending(g);
    if (d === null) throw new Error('no question');
    expect(g.act(1 - d.seat).try.action({ kind: 'acceptOptional' })).toMatchObject({ ok: false });
  });
});
