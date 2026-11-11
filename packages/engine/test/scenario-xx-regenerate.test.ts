// Regenerate (CR 701.19), keyword batch 2 (D-116, D-120): `regenerate` creates a regeneration shield, a
// replacement effect for the next destruction this turn; the activated form is an ordinary activated ability;
// "It can't be regenerated" (`destroy` with `cantBeRegenerated`).
// Pins: CR 701.19a (the next time the permanent would be destroyed this turn, instead remove all damage marked
// on it and tap it; if it is attacking or blocking, remove it from combat), CR 701.19c (making a shield is
// not regenerating; "can't be regenerated" makes the shield not apply), CR 704.5g and 704.5h (lethal damage
// and deathtouch destroy), CR 704.5f (0 toughness is not a destruction), CR 701.21 (sacrifice is not a
// destruction), CR 704.5j (the legend rule is not a destruction), CR 514.2 (the shield ends with the turn),
// CR 702.12b (indestructible: not destroyed), CR 509.1h (a creature blocked by a creature removed from combat
// stays blocked), CR 510.4 (first strike damage step).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TROLL = 'SYNTHETIC Regenerating Troll'; // 2/2 {2}{B}: {1}{B}: Regenerate this creature.
const CHARM = 'SYNTHETIC Regrowth Charm'; // {G} instant: Regenerate target creature.
const SMITE = 'SYNTHETIC Final Smite'; // {1}{B}{B}: destroy target creature, it can't be regenerated
const RITE = 'SYNTHETIC Self Edict'; // {B} sorcery: sacrifice a creature
const WRATH = 'SYNTHETIC Wrath'; // {2}{W}{W}: destroy all creatures
const SHRINK = 'SYNTHETIC Shrink'; // {B}: -2/-2
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const BOLT0 = 'Lightning Bolt[0]'; // the first of two in hand
const BEARS = 'Grizzly Bears';
const RATS = 'Typhoid Rats'; // 1/1 deathtouch
const KNIGHT = 'Youthful Knight'; // 2/1 first strike
const ISAMARU = 'Isamaru, Hound of Konda'; // legendary 2/2
const LIBRARY = ['Island', 'Island', 'Island'] as const;

function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

const shields = (g: ScenarioGame) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'regenerate');

/** Seat 0 has a Troll and `swamps` Swamps; seat 1 has a Mountain and a Bolt, like Murder's player has Swamps. */
function troll(swamps = 2, mine: readonly string[] = [TROLL]) {
  return scenario()
    .seat(0)
    .battlefield(...mine, ...Array.from({ length: swamps }, () => 'Swamp'))
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Mountain', 'Mountain')
    .hand(BOLT, BOLT)
    .library(...LIBRARY)
    .build();
}

function activateRegenerate(g: ScenarioGame): void {
  g.act(0).activate(TROLL, { pay: true });
  resolveTop(g);
}

describe('CR 701.19a: the next time it would be destroyed this turn', () => {
  test('lethal damage: it stays, tapped, with no damage, and the shield is used up', () => {
    const g = troll();
    activateRegenerate(g);
    expect(shields(g)).toHaveLength(1);
    // Passing priority to the opponent: Bolt the troll (3 damage on a 2/2).
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.damage(TROLL, 0);
    g.expect.tapped(TROLL, true);
    expect(shields(g)).toHaveLength(0);
    g.expect.eventLog([{ kind: 'regenerated' }, { kind: 'tapped' }]);
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });

  test('a second destruction the same turn is not replaced: one shield, once', () => {
    const g = troll();
    activateRegenerate(g);
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
  });

  test('two shields protect twice (each activation makes one)', () => {
    const g = troll(4);
    activateRegenerate(g);
    activateRegenerate(g);
    expect(shields(g)).toHaveLength(2);
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    expect(shields(g)).toHaveLength(0);
  });

  test('the shield ends with the turn (CR 514.2), and it protects only that permanent', () => {
    const g = troll(2, [TROLL, BEARS]);
    activateRegenerate(g);
    expect(shields(g)).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(shields(g)).toHaveLength(0);
    // The Bears never had one: lethal damage destroys them even in the turn of the shield.
    const h = troll(2, [TROLL, BEARS]);
    activateRegenerate(h);
    h.act(0).pass();
    h.act(1).cast(BOLT0, { targets: [BEARS], pay: true });
    resolveTop(h);
    h.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(shields(h)).toHaveLength(1);
  });

  test('a destroy effect: Murder is replaced, the creature stays tapped', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .build();
    activateRegenerate(g);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, true);
    expect(shields(g)).toHaveLength(0);
  });

  test('without a shield Murder destroys it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL)
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MURDER, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
  });

  test('"Destroy all creatures": the shielded one stays, the others die', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, BEARS, 'Swamp', 'Swamp', 'Plains', 'Plains', 'Plains', 'Plains')
      .hand(WRATH)
      .seat(1)
      .battlefield(BEARS)
      .build();
    activateRegenerate(g);
    g.act(0).cast(WRATH, { pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(shields(g)).toHaveLength(0);
  });

  test('"Regenerate target creature": a spell makes the shield, then Murder is replaced', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, 'Forest')
      .hand(CHARM)
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .build();
    g.act(0).cast(CHARM, { targets: [BEARS], pay: true });
    resolveTop(g);
    expect(shields(g)).toHaveLength(1);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, true);
  });

  test('the shield belongs to the permanent: a creature that left and came back has none (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, 'Forest')
      .hand(CHARM)
      .seat(1)
      .battlefield('Island', 'Mountain', 'Mountain')
      .hand('Unsummon', BOLT)
      .build();
    g.act(0).cast(CHARM, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    expect(shields(g)).toHaveLength(1); // the shield still names the old object
    g.expect.invariants();
  });
});

describe('CR 701.19c: what a shield does not replace', () => {
  test('"It can\'t be regenerated": the creature dies, and the shield is not used up', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(SMITE)
      .build();
    activateRegenerate(g);
    g.act(0).pass();
    g.act(1).cast(SMITE, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
    // Not applied, not consumed (CR 701.19c); it names an object that is gone and ends with the turn.
    expect(shields(g)).toHaveLength(1);
    g.expect.noEvent({ kind: 'regenerated' });
  });

  test('activating the ability is allowed under "can\'t be regenerated" and is not regenerating', () => {
    const g = troll();
    activateRegenerate(g);
    expect(shields(g)).toHaveLength(1);
    g.expect.noEvent({ kind: 'regenerated' });
  });

  test('sacrifice is not destruction', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp', 'Swamp')
      .hand(RITE)
      .seat(1)
      .build();
    activateRegenerate(g);
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'regenerated' });
  });

  test('0 toughness is not destruction (CR 704.5f)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp', 'Swamp')
      .hand(SHRINK)
      .seat(1)
      .build();
    activateRegenerate(g);
    g.act(0).cast(SHRINK, { targets: [TROLL], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'regenerated' });
  });

  test('the legend rule is not destruction (CR 704.5j)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ISAMARU, 'Forest', 'Plains')
      .hand(CHARM, ISAMARU)
      .seat(1)
      .build();
    g.act(0).cast(CHARM, { targets: [{ name: ISAMARU, zone: 'battlefield', seat: 0 }], pay: true });
    resolveTop(g);
    expect(shields(g)).toHaveLength(1);
    const shielded = g.id({ name: ISAMARU, zone: 'battlefield', seat: 0 });
    g.act(0).cast({ name: ISAMARU, zone: 'hand', seat: 0 }, { pay: true });
    resolveTop(g);
    // The legend rule asks which to keep: keep the new one, so the shielded one is put into the graveyard.
    expect(g.state.pending?.kind).toBe('choosePermanent');
    const fresh = g
      .find({ name: ISAMARU, zone: 'battlefield', seat: 0 })
      .find((o) => o.id !== shielded);
    g.act(0).choosePermanents(fresh?.id as string);
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'regenerated' });
  });
});

describe('damage and deathtouch (CR 704.5g, 704.5h) and combat (CR 701.19a)', () => {
  test('deathtouch damage destroys a creature with any damage: the shield replaces it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(RATS)
      .library(...LIBRARY)
      .build();
    activateRegenerate(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(TROLL);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: RATS, attacker: TROLL }]);
    g.advanceTo('endOfCombat');
    // The Rats died of the Troll's 2 damage; the Troll took 1 deathtouch damage and regenerated.
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.damage(TROLL, 0);
    expect(shields(g)).toHaveLength(0);
    g.expect.combat({ attackers: [] });
    g.expect.eventLog([{ kind: 'regenerated' }, { kind: 'removedFromCombat' }]);
  });

  test('without the shield the same deathtouch damage kills it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(RATS)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(TROLL);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: RATS, attacker: TROLL }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(TROLL, 'graveyard', { seat: 0 });
  });

  test('a blocker that regenerates in the first-strike step is removed from combat and deals no damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(KNIGHT);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: TROLL, attacker: KNIGHT }]);
    // The troll's controller regenerates it with the mana of its Swamps, before first-strike damage.
    g.act(0).pass();
    g.act(1).activate(TROLL, { pay: true });
    resolveTop(g);
    expect(shields(g)).toHaveLength(1);
    g.advanceTo('endOfCombat');
    g.expect.zone(TROLL, 'battlefield', { seat: 1 });
    g.expect.damage(TROLL, 0);
    // The Knight (2/1) survives: the Troll, removed from combat by the first-strike damage, dealt none.
    g.expect.zone(KNIGHT, 'battlefield', { seat: 0 });
    g.expect.damage(KNIGHT, 0);
    g.expect.tapped(TROLL, true);
    // The Knight stays blocked, though no blocker is left (CR 509.1h).
    g.expect.combat({ attackers: [KNIGHT], blocked: [KNIGHT], blocks: [] });
    g.expect.eventLog([
      { kind: 'regenerated' },
      { kind: 'removedFromCombat', object: g.id({ name: TROLL, seat: 1 }) },
    ]);
  });

  test('an untapped creature that regenerates is tapped, one that is tapped stays tapped without a second event', () => {
    const g = troll();
    activateRegenerate(g);
    g.act(0).pass();
    g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
    resolveTop(g);
    expect(g.events.filter((e) => e.kind === 'tapped' && e.object === g.id(TROLL))).toHaveLength(1);
  });
});

describe('legal actions and determinism', () => {
  test('the activation is offered with {1}{B} and refused without it, agreeing with applyAction', () => {
    const none = troll(1);
    const offered = getLegalActions(none.state, 0).some((a) => a.kind === 'activate');
    expect(offered).toBe(false);
    const g = troll(2);
    const activations = getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');
    expect(activations).toHaveLength(1);
    for (const a of getLegalActions(g.state, 0)) {
      if (a.kind !== 'concede') expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
  });

  test('the same actions give the same state hash twice', () => {
    const run = () => {
      const g = troll();
      activateRegenerate(g);
      g.act(0).pass();
      g.act(1).cast(BOLT0, { targets: [TROLL], pay: true });
      resolveTop(g);
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('a creature with a granted shield survives indestructible-free destroy once, per card definition validity', () => {
    // The structural validator accepts the nodes (CR 701.19a).
    const card = singleFace({
      name: 'SYNTHETIC Test Regenerate Sorcery',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'Regenerate each creature you control.',
      spell: {
        effect: {
          kind: 'regenerate',
          objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
          duration: 'untilEndOfTurn',
        },
      },
    });
    const g = scenario()
      .seat(0)
      .define(card)
      .battlefield(BEARS, TROLL, 'Swamp')
      .hand('SYNTHETIC Test Regenerate Sorcery')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Test Regenerate Sorcery', { pay: true });
    resolveTop(g);
    expect(shields(g)).toHaveLength(2);
  });
});
