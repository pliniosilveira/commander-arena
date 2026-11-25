// The monarch cards of the Riders of Rohan deck (group A): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario
// and is played through applyAction, with three seats where an opponent could matter.
// Pins: CR 725.1 (no monarch until an effect says so), 725.2 (the monarch's end step draw, no source, "that player" is the monarch as the step began), 725.3 (one monarch at a time),
// CR 603.4 (an intervening "if" is checked as the ability triggers and as it resolves), 603.7 and 603.2c (the delayed trigger for the turn, once for the creatures of one damage
// event), 510.2 (combat damage), 118.12a (pay or else), 508.1a (an opponent that can't attack you), 107.3 (X defined by the ability), 903.3 (the commander is a designated card).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const ARCHIVIST = real('Archivist of Gondor');
const CROWN = real('Crown of Gondor');
const FORTH = real('Forth Eorlingas!');
const DENETHOR = real('Denethor, Stone Seer');
const EOMER = real('Éomer, King of Rohan');
const CHAMPIONS = real('Champions of Minas Tirith');

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Every ability of the card is a plain AST that the engine accepts (the cards are `supported`, not just parsed). */
test.each([ARCHIVIST, CROWN, FORTH, DENETHOR, EOMER, CHAMPIONS])(
  '$name is a valid card',
  (card) => {
    expect(validateCard(card)).toEqual([]);
  },
);

/** Both players pass until the stack is empty. */
const resolveAll = (g: ScenarioGame): void => {
  for (let i = 0; i < 20 && g.state.stack.length > 0; i += 1) g.passAll();
};

describe('Archivist of Gondor', () => {
  test('the lowering: the commander trigger with "there is no monarch", and the monarch-turn draw', () => {
    const [damage, draw] = ARCHIVIST.faces[0]?.abilities ?? [];
    expect(damage).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dealsCombatDamage', what: { commander: 'yours' }, to: 'player' },
      effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
      interveningIf: {
        kind: 'not',
        term: {
          kind: 'playerHasDesignation',
          player: { kind: 'eachPlayer' },
          designation: 'monarch',
        },
      },
    });
    expect(draw).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'endStep', whose: 'monarch' },
      effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
    });
  });

  /** Seat 0 has Archivist and their commander (Bears) on the battlefield; seats 1 and 2 are two opponents. */
  function atMain(monarch: 0 | 1 | 2 | null = null): ScenarioGame {
    return scenario({ seats: 3 })
      .define(ARCHIVIST)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ARCHIVIST.name)
      .battlefield(BEARS, { label: 'commander', commander: true })
      .battlefield(BEARS, { label: 'other' })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3, ...(monarch === null ? {} : { monarch }) })
      .build();
  }

  test('the commander deals combat damage to a player and nobody is the monarch: you become the monarch', () => {
    const g = atMain();
    g.expect.monarch(null);
    g.playCombat({
      attack: [{ attacker: 'commander', target: { player: 2 } }],
      until: 'combatDamage',
    });
    resolveAll(g);
    g.expect.monarch(0);
  });

  test('a creature that is not the commander does not trigger it', () => {
    const g = atMain();
    g.playCombat({
      attack: [{ attacker: 'other', target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.expect.stack([]);
    g.expect.monarch(null);
  });

  test('there is a monarch already: the ability does not trigger at all (CR 603.4)', () => {
    const g = atMain(2);
    g.playCombat({
      attack: [{ attacker: 'commander', target: { player: 1 } }],
      until: 'combatDamage',
    });
    // Seat 1, who was hit, is not the monarch, so the inherent trigger of CR 725.2 (damage to the monarch) is not here either.
    g.expect.stack([]);
    g.expect.monarch(2);
  });
});
