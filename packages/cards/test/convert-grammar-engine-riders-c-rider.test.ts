// Flamerush Rider of the Riders of Rohan deck (group C), run as written: "Whenever ~ attacks, create a token that's a copy of another target attacking creature and that's tapped and
// attacking. Exile the token at end of combat." (CR 508.4, 707.2, 111.4, 603.7, 511.1). A SYNTHETIC card imported through the grammar and played with three seats, where the controller
// of the token chooses which opponent it attacks.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

const RIDER = parsed(
  'SYNTHETIC Parsed Rider',
  'Creature — Human Warrior',
  "Whenever ~ attacks, create a token that's a copy of another target attacking creature and that's tapped and attacking. Exile the token at end of combat.",
  { manaCost: '{4}{R}', colors: ['R'], power: '3', toughness: '3' },
);
// A creature whose "whenever ~ attacks" ability must not trigger for a token that was never declared as an attacker (CR 508.4).
const DRILLER = parsed(
  'SYNTHETIC Parsed Driller',
  'Creature — Dwarf Warrior',
  'Whenever ~ attacks, you gain 1 life.',
  { manaCost: '{2}{R}', colors: ['R'], power: '2', toughness: '2' },
);

const tokensNamed = (g: ScenarioGame, name: string) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter(
      (o) =>
        o !== undefined &&
        o.token !== null &&
        getView(g.state, 0).battlefield.some((v) => v.id === o.id && v.name === name),
    );

const board = (...mine: string[]) =>
  scenario({ seats: 3 })
    .define(RIDER)
    .define(DRILLER)
    .seat(0)
    .battlefield(RIDER.name, { label: 'rider' })
    .battlefield(...mine)
    .library(...FILLER)
    .seat(1)
    .battlefield(WALKER, { label: 'walker1' })
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

/** The Rider and `with` attack seat 1; the Rider's trigger targets `target`; returns the game waiting for the choice of what the token attacks. */
const attackAndCopy = (g: ScenarioGame, withLabel: string, target: string) => {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(['rider', withLabel], { player: 1 });
  // The one legal target (another attacking creature) is chosen as the ability is put on the stack; two triggers are put in order.
  if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
  g.passAll();
  void target;
  return g;
};

describe('Flamerush Rider as written (CR 508.4, 707.2, 603.7)', () => {
  test('it copies another attacking creature: a tapped token, and its controller chooses which opponent it attacks (the ruling)', () => {
    const g = attackAndCopy(board(BEARS), BEARS, BEARS);
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected chooseOption');
    expect(d.purpose).toBe('attackTarget');
    expect(d.options).toEqual(expect.arrayContaining(['player:1', 'player:2']));
    // Not the player the Rider attacks: the other opponent.
    g.act(0).chooseOption('player:2');
    const made = tokensNamed(g, BEARS);
    expect(made).toHaveLength(1);
    expect(made[0]?.tapped).toBe(true);
    const attack = g.state.combat?.attackers.find((a) => a.object === made[0]?.id);
    expect(attack?.target).toEqual({ kind: 'player', seat: 2 });
    g.expect.invariants();
  });

  test('the token may attack a planeswalker of an opponent too', () => {
    const g = attackAndCopy(board(BEARS), BEARS, BEARS);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected chooseOption');
    g.act(0).chooseOption(`permanent:${g.id('walker1')}`);
    const made = tokensNamed(g, BEARS);
    const attack = g.state.combat?.attackers.find((a) => a.object === made[0]?.id);
    expect(attack?.target).toEqual({ kind: 'permanent', object: g.id('walker1') });
  });

  test('the token was never declared as an attacker: its "whenever this attacks" ability does not trigger', () => {
    const g = attackAndCopy(board(DRILLER.name), DRILLER.name, DRILLER.name);
    g.act(0).chooseOption('player:1');
    g.expect.stack([]);
    // The Driller itself gained 1 life as it was declared; the copy added nothing.
    g.expect.life(0, 41);
    expect(tokensNamed(g, DRILLER.name)).toHaveLength(1);
    g.expect.invariants();
  });

  test('the token is exiled at end of combat, and deals combat damage before that', () => {
    const g = attackAndCopy(board(BEARS), BEARS, BEARS);
    g.act(0).chooseOption('player:2');
    g.advanceTo('combatDamage');
    g.expect.life(2, 40 - 2);
    g.advanceTo('endOfCombat');
    g.passAll();
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
  });

  test('"another": the Rider cannot copy itself, so with no other attacker the ability has no target', () => {
    const g = board(BEARS);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['rider'], { player: 1 });
    // Only attacking creatures other than the Rider are targets, and there are none: the ability has no target and leaves the stack.
    g.expect.stack([]);
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
  });
});
