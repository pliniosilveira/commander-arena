// The monarch cards of the Riders of Rohan deck (group A), second half: the end-step draw of Archivist of Gondor, Crown of Gondor, Forth Eorlingas!, Denethor, Stone Seer, Éomer, King of
// Rohan and Champions of Minas Tirith. The REAL Oracle text of the golden corpus goes through the grammar with no override and is played through applyAction with three seats.
// Pins: CR 725.2 (the monarch's end step draw; its controller draws "that player"), 725.3, CR 603.4 (intervening "if" with "there is no monarch"), 603.7 and 603.2c (a delayed trigger for the
// turn, once for the creatures of one damage event), 510.2, 118.12a (pay or else), 508.1a (the opponent that can't attack you), 107.3 (X given by the ability), 701.21a (sacrifice as a cost).
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
const ISAMARU = 'Isamaru, Hound of Konda'; // a legendary creature of the engine's fixtures, with no ability of its own
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Both players pass until the stack is empty. */
const resolveAll = (g: ScenarioGame): void => {
  for (let i = 0; i < 20 && g.state.stack.length > 0; i += 1) g.passAll();
};

describe('Archivist of Gondor: the monarch draws at the beginning of their end step', () => {
  const at = (active: 0 | 1 | 2, monarch: 0 | 1 | 2 | null): ScenarioGame =>
    scenario({ seats: 3 })
      .define(ARCHIVIST)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ARCHIVIST.name)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('postcombatMain', { active, turn: 3 + active, ...(monarch === null ? {} : { monarch }) })
      .build();

  test('on the turn of the monarch, an opponent of the controller, "that player" draws: once for the card, once for CR 725.2', () => {
    const g = at(1, 1);
    g.advanceTo('end');
    g.expect.stack([`${ARCHIVIST.name} (ability)`, 'The monarch (ability)']);
    resolveAll(g);
    // Seat 1 drew for the inherent ability and for Archivist's; the controller and the third player drew nothing.
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.handSize(2, 0);
  });

  test('on the turn of a player who is not the monarch it does not trigger', () => {
    const g = at(2, 1);
    g.advanceTo('end');
    g.expect.stack([]);
  });

  test('with no monarch nothing triggers at any end step', () => {
    const g = at(0, null);
    g.advanceTo('end');
    g.expect.stack([]);
  });
});

describe('Crown of Gondor', () => {
  const table = (monarch: 0 | 1 | null): ScenarioGame =>
    scenario({ seats: 3 })
      .define(CROWN)
      .seat(0)
      .library(...LIBRARY)
      .hand(ISAMARU, BEARS)
      .battlefield(CROWN.name)
      .battlefield('Plains', { count: 2 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3, ...(monarch === null ? {} : { monarch }) })
      .build();

  test('a legendary creature you control enters and nobody is the monarch: you become the monarch', () => {
    const g = table(null);
    g.act(0).cast(ISAMARU, { pay: true });
    g.pass();
    g.pass();
    g.pass();
    // The spell resolved and the creature entered: the ability of the Crown is on the stack.
    g.expect.stack([`${CROWN.name} (ability)`]);
    g.expect.monarch(null);
    resolveAll(g);
    g.expect.zone(ISAMARU, 'battlefield');
    g.expect.monarch(0);
  });

  test('a creature that is not legendary does not trigger it', () => {
    const g = table(null);
    g.act(0).cast(BEARS, { pay: true });
    resolveAll(g);
    g.expect.zone(BEARS, 'battlefield');
    g.expect.monarch(null);
  });

  test('another player is the monarch: the ability does not trigger (CR 603.4)', () => {
    const g = table(1);
    g.act(0).cast(ISAMARU, { pay: true });
    g.passAll();
    g.expect.zone(ISAMARU, 'battlefield');
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'monarchChanged' });
    g.expect.monarch(1);
  });
});

describe('Forth Eorlingas!', () => {
  test('the spell is a creating sentence and a delayed ability of the turn', () => {
    const effect = FORTH.faces[0]?.spell?.effect;
    expect(JSON.stringify(effect)).toContain('delayedCombatDamageBatchTurn');
  });

  function cast(blocker = false): ScenarioGame {
    const g = scenario({ seats: 3 })
      .define(FORTH)
      .seat(0)
      .library(...LIBRARY)
      .hand(FORTH.name)
      .battlefield('Mountain')
      .battlefield('Plains', { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...(blocker ? [BEARS] : []))
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(FORTH.name).x(2).pay();
    resolveAll(g);
    return g;
  }

  const knights = (g: ScenarioGame) =>
    g.find({ zone: 'battlefield', seat: 0, name: 'Human Knight' });

  test('two tokens with haste hit one player together: one trigger for the damage, and you become the monarch', () => {
    const g = cast();
    const tokens = knights(g);
    expect(tokens).toHaveLength(2);
    g.expect.monarch(null);
    g.playCombat({
      attack: tokens.map((t) => ({ attacker: t.id, target: { player: 1 } })),
      until: 'combatDamage',
    });
    g.expect.stack([`${FORTH.name} (ability)`]);
    resolveAll(g);
    g.expect.monarch(0);
  });

  test('tokens that hit two different players: the ability triggers for each and you become the monarch once', () => {
    const g = cast();
    const [first, second] = knights(g);
    g.playCombat({
      attack: [
        { attacker: first?.id ?? 'o0', target: { player: 1 } },
        { attacker: second?.id ?? 'o0', target: { player: 2 } },
      ],
      until: 'declareBlockers',
    });
    g.passAll();
    g.passAll();
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    resolveAll(g);
    g.expect.monarch(0);
    g.expect.eventLog([{ kind: 'monarchChanged', from: null, to: 0 }]);
  });

  test('the only creature is blocked and deals its combat damage to a creature: you do not become the monarch', () => {
    const g = cast(true);
    const [first] = knights(g);
    g.playCombat({
      attack: [{ attacker: first?.id ?? 'o0', target: { player: 1 } }],
      block: [{ blocker: BEARS, attacker: first?.id ?? 'o0' }],
      until: 'endOfCombat',
    });
    resolveAll(g);
    g.expect.monarch(null);
  });

  test('the delayed ability ends with the turn: damage on a later turn does nothing', () => {
    const g = cast();
    // No combat this turn: the next turn of seat 0 comes after the ability ended (CR 514.2).
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.monarch(null);
    expect(g.state.delayedTriggers).toEqual([]);
  });
});

describe('Denethor, Stone Seer', () => {
  test('{3}{R}, {T}, sacrifice it: the target player becomes the monarch and it deals 3 damage to any target', () => {
    const g = scenario({ seats: 3 })
      .define(DENETHOR)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DENETHOR.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .seat(2)
      .library(...LIBRARY)
      .life(20)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0)
      .activate(DENETHOR.name, { ability: 1 })
      .targets([{ player: 2 }, { player: 1 }])
      .pay();
    g.expect.zone(DENETHOR.name, 'graveyard');
    resolveAll(g);
    g.expect.monarch(2);
    g.expect.life(1, 17);
    g.expect.life(2, 20);
  });
});

describe('Éomer, King of Rohan', () => {
  test('when it enters, the target player becomes the monarch and it deals damage equal to its power to any target', () => {
    const g = scenario({ seats: 3 })
      .define(EOMER)
      .seat(0)
      .library(...LIBRARY)
      .hand(EOMER.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .seat(2)
      .library(...LIBRARY)
      .life(20)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(EOMER.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 }, { player: 2 });
    resolveAll(g);
    g.expect.monarch(1);
    g.expect.life(2, 18);
    g.expect.life(1, 20);
  });
});

describe('Champions of Minas Tirith', () => {
  const ability = CHAMPIONS.faces[0]?.abilities.find(
    (a) => a.kind === 'triggered' && a.trigger.kind === 'step',
  );

  test('the lowering: an opponent pays X, the number of cards in their hand, or can not attack you this combat', () => {
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'opponent' },
      effect: {
        kind: 'unlessPays',
        player: { kind: 'triggerPlayer' },
        cost: [{ kind: 'mana', symbols: ['X'] }],
        xIsHandSize: true,
        effect: {
          kind: 'creaturesCantAttackYou',
          creatures: { types: ['creature'] },
          duration: 'thisCombat',
          player: { kind: 'triggerPlayer' },
        },
      },
      interveningIf: {
        kind: 'playerHasDesignation',
        player: { kind: 'you' },
        designation: 'monarch',
      },
    });
  });

  /** Seat 0 controls Champions and is the monarch; it is the turn of seat 1, who has `hand` cards and `lands` Plains; seat 2 is a third player with a creature. */
  function atOpponentCombat(options: {
    readonly hand: number;
    readonly lands: number;
    readonly monarch?: 0 | 2;
  }): ScenarioGame {
    return scenario({ seats: 3 })
      .define(CHAMPIONS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CHAMPIONS.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(...Array.from({ length: options.hand }, () => 'Plains'))
      .battlefield(...Array.from({ length: options.lands }, () => 'Plains'))
      .battlefield(BEARS, { label: 'raider' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 4, monarch: options.monarch ?? 0 })
      .build();
  }

  /** To the beginning of combat of seat 1 and through the trigger of Champions, which asks seat 1 when it can pay. */
  const toTrigger = (g: ScenarioGame): void => {
    g.advanceTo('beginningOfCombat', { attack: false });
    g.expect.stack([`${CHAMPIONS.name} (ability)`]);
    g.passAll();
  };

  test('the opponent pays {X} for the cards in their hand: they can attack you', () => {
    const g = atOpponentCombat({ hand: 2, lands: 2 });
    toTrigger(g);
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.pool(1, {});
    g.passAll();
    g.expect.canAttack('raider', true);
    g.expect.legal(1, { declareAttackers: [{ attacker: 'raider', target: { player: 0 } }] });
  });

  test('the opponent does not pay: they can not attack you, but can attack another player', () => {
    const g = atOpponentCombat({ hand: 2, lands: 2 });
    toTrigger(g);
    g.act(1).decline();
    g.passAll();
    g.expect.illegal(1, { declareAttackers: [{ attacker: 'raider', target: { player: 0 } }] });
    g.expect.legal(1, { declareAttackers: [{ attacker: 'raider', target: { player: 2 } }] });
    g.act(1).attack('raider', { player: 2 });
    g.expect.combat({ attackers: ['raider'] });
  });

  test('an opponent with more cards in hand than mana cannot pay and is not asked: they can not attack you', () => {
    const g = atOpponentCombat({ hand: 3, lands: 2 });
    toTrigger(g);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.passAll();
    g.expect.illegal(1, { declareAttackers: [{ attacker: 'raider', target: { player: 0 } }] });
  });

  test('an opponent with no cards in hand pays {0}: nothing is asked and they can attack you', () => {
    const g = atOpponentCombat({ hand: 0, lands: 0 });
    toTrigger(g);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.passAll();
    g.expect.legal(1, { declareAttackers: [{ attacker: 'raider', target: { player: 0 } }] });
  });

  test('you are not the monarch: the ability does not trigger on the turn of an opponent (CR 603.4)', () => {
    const g = atOpponentCombat({ hand: 2, lands: 2, monarch: 2 });
    g.advanceTo('beginningOfCombat', { attack: false });
    g.expect.stack([]);
  });

  test('the bar lasts until the end of combat only: it is gone at the postcombat main phase', () => {
    const g = atOpponentCombat({ hand: 2, lands: 2 });
    toTrigger(g);
    g.act(1).decline();
    expect(
      g.state.continuousEffects.some((e) => e.change.kind === 'creaturesCantAttackPlayer'),
    ).toBe(true);
    g.advanceTo('postcombatMain');
    expect(
      g.state.continuousEffects.some((e) => e.change.kind === 'creaturesCantAttackPlayer'),
    ).toBe(false);
  });
});

test.each([ARCHIVIST, CROWN, FORTH, DENETHOR, EOMER, CHAMPIONS])(
  '$name is a valid card',
  (card) => {
    expect(validateCard(card)).toEqual([]);
  },
);
