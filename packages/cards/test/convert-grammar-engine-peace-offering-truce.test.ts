// The Peace Offering deck, group H: Tenuous Truce, read from its REAL Oracle text (the golden corpus, taken from the issue) through the grammar with no override, and run by the engine
// as the parser wrote it. Pins: CR 702.5a, 303.4a and 102.3 ("Enchant opponent": the spell targets an opponent), CR 303.4m and 603.2b ("enchanted opponent's end step"), CR 508.1,
// 508.1b, 508.6 and 603.2c (the attack triggers: once for a declaration, the enchanted player's planeswalkers count, another opponent does not). Built for more than one opponent:
// the game has three seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const ENTRY = GOLDEN.find((c) => c.name === 'Tenuous Truce');
if (ENTRY === undefined) throw new Error('Tenuous Truce is not in the golden corpus');

/** The real card, imported through the grammar only; it must read as supported. */
function truceCard(): CardDefinition {
  if (ENTRY === undefined) throw new Error('no Tenuous Truce');
  const imported = importCard(fromGoldenCard(ENTRY), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.reasons).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const TRUCE = 'Tenuous Truce';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const bears = (seat: 0 | 1 | 2) => ({ name: BEARS, zone: 'battlefield' as const, seat });

describe('the AST the grammar writes', () => {
  test('Enchant opponent, the end step of the enchanted player, and one sacrifice for two attack events', () => {
    const card = truceCard();
    expect(validateCard(card)).toEqual([]);
    const abilities = card.faces[0]?.abilities ?? [];
    expect(abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'enchant', filter: {}, player: true, opponent: true },
    });
    const triggers = abilities.flatMap((a) => (a.kind === 'triggered' ? [a.trigger] : []));
    expect(triggers).toEqual([
      { kind: 'step', step: 'endStep', whose: 'enchantedPlayer' },
      { kind: 'attackBatch', who: 'you', atLeast: 1, attackedEnchantedPlayerOrPlaneswalkers: true },
      {
        kind: 'attackBatch',
        who: 'any',
        atLeast: 1,
        byEnchantedPlayer: true,
        attackedYouOrPlaneswalkers: true,
      },
    ]);
    const effects = abilities.flatMap((a) => (a.kind === 'triggered' ? [a.effect] : []));
    // "you and that player each draw a card": one draw instruction for the two players.
    expect(effects[0]).toEqual({
      kind: 'draw',
      player: { kind: 'all', of: [{ kind: 'you' }, { kind: 'triggerPlayer' }] },
      count: 1,
    });
    expect(effects[1]).toEqual(effects[2]);
    expect(JSON.stringify(effects[1])).toContain('sacrifice');
  });
});

describe('the engine runs the card as the grammar wrote it (three seats)', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(truceCard())
      .seat(0)
      .library(...LIBRARY)
      .hand(TRUCE)
      .battlefield('Plains', { count: 2 })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(WALKER)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
  const enchanting = () => {
    const g = game();
    g.act(0).cast(TRUCE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.objects[g.id(TRUCE)]?.attachedToPlayer).toBe(1);
    return g;
  };
  const hands = (g: ReturnType<typeof game>) => g.state.seats.map((s) => s.hand.length);

  test('the spell can target only an opponent', () => {
    const g = game();
    g.act(0).cast(TRUCE);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected the targets decision');
    const seats = d.specs.flatMap((spec) =>
      spec.legal.flatMap((t) => (t.kind === 'player' ? [t.seat] : [])),
    );
    expect(seats.sort()).toEqual([1, 2]);
  });

  test("the enchanted opponent's end step: you and that player each draw a card; the other opponent does not", () => {
    const g = enchanting();
    g.advanceTo('end', { turn: g.state.turn.number + 1 });
    const before = hands(g);
    g.passAll();
    expect(hands(g)).toEqual([(before[0] ?? 0) + 1, (before[1] ?? 0) + 1, before[2]]);
  });

  test('two creatures attacking the enchanted opponent and their planeswalker: one trigger, the Aura is sacrificed', () => {
    const g = scenario({ seats: 3 })
      .define(truceCard())
      .seat(0)
      .library(...LIBRARY)
      .hand(TRUCE)
      .battlefield('Plains', { count: 2 })
      .battlefield(BEARS)
      .battlefield("Healer's Hawk")
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TRUCE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: "Healer's Hawk", target: WALKER },
    ]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.zone(TRUCE, 'graveyard');
  });

  test('attacking the other opponent: the Aura stays', () => {
    const g = enchanting();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: bears(0), target: { player: 2 } }]);
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    g.expect.zone(TRUCE, 'battlefield');
  });

  test('the enchanted opponent attacks you: the Aura is sacrificed; the other opponent attacking you does nothing', () => {
    const g = enchanting();
    g.advanceTo('declareAttackers', { turn: g.state.turn.number + 1 });
    g.act(1).declareAttackers([{ attacker: bears(1), target: { player: 0 } }]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.zone(TRUCE, 'graveyard');

    const h = enchanting();
    h.advanceTo('declareAttackers', { turn: h.state.turn.number + 2 });
    h.act(2).declareAttackers([{ attacker: bears(2), target: { player: 0 } }]);
    expect(h.state.stack).toHaveLength(0);
    h.passAll();
    h.expect.zone(TRUCE, 'battlefield');
  });
});
