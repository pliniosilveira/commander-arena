// The Peace Offering deck, group G: Illusionist's Gambit, read from its REAL Oracle text (the golden corpus, taken from the issue) through the grammar with no override, and run by the
// engine as the parser wrote it. Pins: CR 101.2 and 601.3 (it can be cast only during the declare blockers step of an opponent's turn), CR 506.4 and 608.2c (every attacker leaves combat
// and untaps), CR 500.8 (one more combat phase, then the postcombat main phase of the turn: no main phase is added), CR 508.1c and 508.1d (in that combat only, those creatures attack if
// able and can't attack the caster or the caster's planeswalkers). Built for more than one opponent: the game has three seats, and the creatures attack the other opponent.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const ENTRY = GOLDEN.find((c) => c.name === "Illusionist's Gambit");
if (ENTRY === undefined) throw new Error("Illusionist's Gambit is not in the golden corpus");

/** The real card, imported through the grammar only; it must read as supported. */
function gambitCard(): CardDefinition {
  if (ENTRY === undefined) throw new Error("no Illusionist's Gambit");
  const imported = importCard(fromGoldenCard(ENTRY), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.reasons).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const GAMBIT = "Illusionist's Gambit";
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('the AST the grammar writes', () => {
  test('a restriction on casting, the removal, the untap of those creatures and the combat that binds them', () => {
    const card = gambitCard();
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    expect(face?.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: {
          kind: 'not',
          term: {
            kind: 'and',
            terms: [
              { kind: 'duringStep', step: 'declareBlockers' },
              { kind: 'not', term: { kind: 'yourTurn' } },
            ],
          },
        },
      },
    ]);
    expect(face?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'removeFromCombat', objects: { kind: 'each', filter: { attacking: true } } },
        { kind: 'untap', objects: { kind: 'removedFromCombat' } },
        {
          kind: 'extraCombat',
          those: {
            objects: { kind: 'removedFromCombat' },
            attackIfAble: true,
            cantAttackYou: true,
          },
        },
      ],
    });
  });
});

describe('the engine runs the card as the grammar wrote it (three seats)', () => {
  /** Seat 0 attacks seat 1 with two Bears; seat 1 holds the Gambit and has a planeswalker; seat 2 is the other opponent. */
  const game = (): ScenarioGame =>
    scenario({ seats: 3 })
      .define(gambitCard())
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(BEARS, { label: 'b2' })
      .seat(1)
      .library(...LIBRARY)
      .hand(GAMBIT)
      .battlefield('Island', { count: 4 })
      .battlefield(WALKER)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const noBlocks = (g: ScenarioGame) => {
    const d = g.state.pending;
    if (d?.kind === 'declareBlockers') g.act(d.seat).declareBlockers([]);
  };

  /** Passes priority until a declaration of attackers is asked or the postcombat main phase is reached. */
  const toNextDeclaration = (g: ScenarioGame) => {
    for (let i = 0; i < 20; i += 1) {
      if (g.state.pending?.kind === 'declareAttackers') return;
      if (g.state.turn.step === 'postcombatMain') return;
      g.pass();
    }
  };

  test('it can’t be cast in the declare attackers step; it can in the declare blockers step', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'b1', target: { player: 1 } },
      { attacker: 'b2', target: { player: 1 } },
    ]);
    g.act(0).pass();
    g.expect.illegal(1, { cast: GAMBIT });
    g.passAll();
    noBlocks(g);
    expect(g.state.turn.step).toBe('declareBlockers');
    g.act(0).pass();
    g.expect.legal(1, { cast: GAMBIT });
  });

  test('the attackers leave combat and untap; in the added combat they must attack, and only the other opponent', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'b1', target: { player: 1 } },
      { attacker: 'b2', target: { player: 1 } },
    ]);
    g.passAll();
    noBlocks(g);
    g.act(0).pass();
    g.act(1).cast(GAMBIT, { pay: true });
    g.passAll();
    g.expect.tapped('b1', false);
    g.expect.tapped('b2', false);
    toNextDeclaration(g);
    g.expect.life(1, 40);
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected the added declaration');
    expect([...d.mustAttack].sort()).toEqual([g.id('b1'), g.id('b2')].sort());
    for (const c of d.candidates) expect(c.targets).toEqual([{ kind: 'player', seat: 2 }]);
    g.act(0).declareAttackers([
      { attacker: 'b1', target: { player: 2 } },
      { attacker: 'b2', target: { player: 2 } },
    ]);
    g.passAll();
    noBlocks(g);
    toNextDeclaration(g);
    g.expect.life(2, 36);
    expect(g.state.turn.step).toBe('postcombatMain');
    g.expect.invariants();
  });
});
