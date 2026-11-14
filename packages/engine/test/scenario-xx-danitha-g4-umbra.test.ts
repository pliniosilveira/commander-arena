// Umbra armor (CR 702.89a), the Danitha deck (issue 26), group 4 (D-1241, D-1242): "If enchanted permanent would be destroyed, instead remove all damage marked
// on it and destroy this Aura." A replacement effect of the Aura for the destruction of the permanent it is attached to: by the effect `destroy` (a
// resolving spell) and by the state-based actions for lethal damage and deathtouch (CR 704.5g, 704.5h). A regeneration shield (CR 701.19a) and a second Umbra
// armor on the same permanent replace the same destruction, and the permanent's controller chooses which one applies (CR 616.1): the replacement question of
// damage and tokens (`chooseOption`, purpose `replacement`), asked only with two or more effects. Pins: CR 702.12b (indestructible: not destroyed, nothing to
// replace), CR 704.5f (0 toughness is not a destruction), CR 701.19c ("can't be regenerated" does not stop Umbra armor, which is not a regeneration), CR 616.1f.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g4.ts, synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameEvent } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseOptionDecision } from './pending-helpers';

const HIDE = 'SYNTHETIC Umbra Hide'; // Aura +2/+2, Umbra armor
const VEIL = 'SYNTHETIC Umbra Veil'; // Aura reach, Umbra armor
const TROLL = 'SYNTHETIC Regenerating Troll'; // 2/2 {1}{B}: Regenerate this creature.
const SMITE = 'SYNTHETIC Final Smite'; // destroy target creature, it can't be regenerated
const WRATH = 'SYNTHETIC Wrath'; // destroy all creatures
const SHRINK = 'SYNTHETIC Shrink'; // {B}: -2/-2
const WARDING = 'SYNTHETIC Warding Aura'; // enchanted creature has indestructible
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const RATS = 'Typhoid Rats'; // 1/1 deathtouch
const LIBRARY = ['Island', 'Island', 'Island'] as const;

type G = ReturnType<ReturnType<typeof scenario>['build']>;

const shields = (g: G) => g.state.continuousEffects.filter((e) => e.change.kind === 'regenerate');
const kinds = (events: readonly GameEvent[]) => events.map((e) => e.kind);

/**
 * Seat 0 has the creatures `mine` and the Auras `auras` (each is `[Aura, creature it is attached to]`), seat 1 has Mountains, Swamps and the spells `hand`.
 * Seat 0 has two Swamps for the Troll's regeneration.
 */
function board(
  mine: readonly string[],
  auras: readonly (readonly [string, string])[],
  hand: readonly string[],
) {
  const s = scenario().seat(0);
  for (const name of mine) s.battlefield(name);
  for (const [aura, host] of auras) s.battlefield(aura, { attachedTo: host });
  return s
    .battlefield('Swamp', 'Swamp')
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
    .hand(...hand)
    .library(...LIBRARY)
    .build();
}

/** Seat 0 passes and seat 1 casts `card` (on `target`); the spell resolves, or stops at the first question. */
function strike(g: G, card: string, target?: string): void {
  g.act(0).pass();
  g.act(1).cast(card, { pay: true, ...(target === undefined ? {} : { targets: [target] }) });
  g.passAll();
}

/** The Troll regenerates: a shield for the turn. */
function shield(g: G): void {
  g.act(0).activate(TROLL, { pay: true });
  g.passAll();
}

describe('Umbra armor replaces a destruction (CR 702.89a)', () => {
  test('lethal damage (CR 704.5g): the creature stays with no damage, the Aura is destroyed, the creature is not tapped', () => {
    const g = board([BEARS], [[VEIL, BEARS]], [BOLT]);
    const mark = g.mark();
    strike(g, BOLT, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 0);
    g.expect.tapped(BEARS, false);
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'died', object: g.id(BEARS) }, { since: mark });
    g.expect.eventLog([{ kind: 'umbraArmorUsed' }, { kind: 'zoneChanged' }], { since: mark });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('a destroy effect: the creature stays, the damage already marked is removed, the Aura goes to the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { damage: 1 })
      .battlefield(HIDE, { attachedTo: BEARS })
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .library(...LIBRARY)
      .build();
    g.expect.pt(BEARS, 4, 4);
    strike(g, MURDER, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 0);
    g.expect.zone(HIDE, 'graveyard', { seat: 0 });
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('it is used up with the Aura: the next destruction kills the creature', () => {
    const g = board([BEARS], [[VEIL, BEARS]], [BOLT, BOLT]);
    strike(g, `${BOLT}[0]`, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    strike(g, `${BOLT}[0]`, BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('deathtouch damage (CR 704.5h): the damage is removed and the creature stays', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(VEIL, { attachedTo: BEARS })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(RATS)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: RATS, attacker: BEARS }],
    });
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 0);
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('"it can\'t be regenerated" (CR 701.19c) does not stop it: Umbra armor is not a regeneration', () => {
    const g = board([BEARS], [[VEIL, BEARS]], [SMITE]);
    strike(g, SMITE, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
  });

  test('an indestructible creature is not destroyed (CR 702.12b): nothing is replaced, the Aura stays, the damage stays', () => {
    const g = board(
      [BEARS],
      [
        [VEIL, BEARS],
        [WARDING, BEARS],
      ],
      [BOLT],
    );
    strike(g, BOLT, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 3);
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'umbraArmorUsed' });
  });

  test('0 toughness is no destruction (CR 704.5f): the creature dies, and the Aura falls off with it', () => {
    const g = board([BEARS], [[VEIL, BEARS]], [SHRINK]);
    strike(g, SHRINK, BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'umbraArmorUsed' });
  });

  test('a creature with no Umbra Aura is destroyed as usual; the Aura of another creature stays', () => {
    const g = board([BEARS, TROLL], [[VEIL, TROLL]], [MURDER]);
    strike(g, MURDER, BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'umbraArmorUsed' });
  });
});

describe('Umbra armor with a regeneration shield or a second Umbra Aura (CR 616.1)', () => {
  test('one effect applies: nothing is asked (the shield alone regenerates, as before)', () => {
    const g = board([TROLL], [], [BOLT]);
    shield(g);
    strike(g, BOLT, TROLL);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, true);
    expect(shields(g)).toHaveLength(0);
  });

  test('a shield and an Umbra Aura: the controller is asked (not the caster), each answer uses up one effect only', () => {
    const g = board([TROLL], [[VEIL, TROLL]], [MURDER]);
    shield(g);
    strike(g, MURDER, TROLL);
    // Seat 1 cast it, the controller of the creature chooses.
    g.expect.pending('chooseOption', 0);
    const d = chooseOptionDecision(g);
    expect(d.purpose).toBe('replacement');
    expect(d.options).toEqual(['regenerate', `umbra:${g.id(VEIL)}`]);
    expect(d.replacement?.destroy).toMatchObject({ objectName: TROLL, during: 'resolution' });
    expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['regenerate', 'umbra']);
    // Nothing happened yet.
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    expect(shields(g)).toHaveLength(1);
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.act(0).chooseOption('regenerate');
    g.passAll();
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, true);
    expect(shields(g)).toHaveLength(0);
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the other answer: the Aura is destroyed, the shield stays, the creature is not tapped', () => {
    const g = board([TROLL], [[VEIL, TROLL]], [MURDER]);
    shield(g);
    strike(g, MURDER, TROLL);
    g.act(0).chooseOption(`umbra:${g.id(VEIL)}`);
    g.passAll();
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, false);
    expect(shields(g)).toHaveLength(1);
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('"can\'t be regenerated": the shield does not apply, so only Umbra armor does and nothing is asked', () => {
    const g = board([TROLL], [[VEIL, TROLL]], [SMITE]);
    shield(g);
    strike(g, SMITE, TROLL);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    expect(shields(g)).toHaveLength(1);
  });

  test('two Umbra Auras: asked, the Aura chosen is destroyed and the other stays; the creature is not destroyed again (CR 616.1f)', () => {
    const g = board(
      [BEARS],
      [
        [VEIL, BEARS],
        [HIDE, BEARS],
      ],
      [MURDER],
    );
    strike(g, MURDER, BEARS);
    const d = chooseOptionDecision(g);
    expect(d.options).toEqual([`umbra:${g.id(VEIL)}`, `umbra:${g.id(HIDE)}`]);
    g.act(0).chooseOption(`umbra:${g.id(HIDE)}`);
    g.passAll();
    g.expect.pending('priority');
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(HIDE, 'graveyard', { seat: 0 });
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an answer that is not one of the effects is refused and the question stays', () => {
    const g = board([TROLL], [[VEIL, TROLL]], [MURDER]);
    shield(g);
    strike(g, MURDER, TROLL);
    const refused = applyAction(g.state, 0, { kind: 'chooseOption', option: 'umbra:nothing' });
    expect(refused.ok).toBe(false);
    g.expect.pending('chooseOption', 0);
  });

  test('state-based actions ask too (CR 704.5g): the damage waits, the answer is applied and play goes on', () => {
    const g = board([TROLL], [[VEIL, TROLL]], [BOLT]);
    shield(g);
    strike(g, BOLT, TROLL);
    g.expect.pending('chooseOption', 0);
    const d = chooseOptionDecision(g);
    expect(d.replacement?.destroy).toMatchObject({ objectName: TROLL, during: 'sba' });
    g.expect.damage(TROLL, 3);
    const mark = g.mark();
    g.act(0).chooseOption(`umbra:${g.id(VEIL)}`);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.damage(TROLL, 0);
    g.expect.zone(VEIL, 'graveyard', { seat: 0 });
    expect(shields(g)).toHaveLength(1);
    g.expect.pending('priority');
    expect(kinds(g.eventsSince(mark))).toEqual(
      expect.arrayContaining(['replacementChosen', 'umbraArmorUsed']),
    );
    g.expect.invariants();
  });

  test('a destroy-all effect asks in the middle and goes on: the other creatures die after the answer', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL)
      .battlefield(BEARS)
      .battlefield(VEIL, { attachedTo: TROLL })
      .battlefield('Swamp', 'Swamp', 'Plains', 'Plains', 'Plains', 'Plains')
      .hand(WRATH)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    shield(g);
    g.act(0).cast(WRATH, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(0).chooseOption('regenerate');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.zone(VEIL, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the same log replays the same game (the question and its answer are ordinary actions)', () => {
    const play = () => {
      const g = board([TROLL], [[VEIL, TROLL]], [MURDER]);
      shield(g);
      strike(g, MURDER, TROLL);
      g.act(0).chooseOption('regenerate');
      g.passAll();
      return g.hash();
    };
    expect(play()).toBe(play());
  });
});
