// Limit Break deck, group 1 (issue 96): attaching Equipment with an ability. The REAL Oracle text of each card (the corpus's golden.jsonl, from the issue) goes through the grammar
// as a card with no override and is played through applyAction in an engine scenario. Equipment and Auras are SYNTHETIC fixtures of the engine.
// Pins: CR 701.3 (Attach: control of the Equipment does not change), CR 701.3b (an Equipment moves only to a permanent it can be attached to), CR 301.5 (Equipment), CR 508.5 (defending
// player), CR 208.1 (power). Every test with an opponent plays with three seats where the player the effect names matters: the attacked player is the one that takes the damage.
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BLADE = 'SYNTHETIC Blade';
const CLOAK = 'SYNTHETIC Cloak';
const BOOTS = 'SYNTHETIC Wing Boots';
const BEARS = 'Grizzly Bears';

const armory = real('Armory Automaton');
const barretLeader = real('Barret, Avalanche Leader');
const cloud = real('Cloud, Ex-SOLDIER');
const barretWallace = real('Barret Wallace');
const business = real('Unfinished Business');

function withDefs(defs: readonly CardDefinition[]) {
  let b = scenario({ seats: 3 })
    .define(syntheticCard(BLADE))
    .define(syntheticCard(CLOAK))
    .define(syntheticCard(BOOTS));
  for (const d of defs) b = b.define(d);
  return b;
}

describe('the cards are valid', () => {
  test.each([armory, barretLeader, cloud, barretWallace, business])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Armory Automaton: "you may attach any number of target Equipment to it" (CR 701.3)', () => {
  const board = () =>
    withDefs([armory])
      .seat(0)
      .hand(armory.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', BLADE, BOOTS)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(CLOAK)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('when it enters, any number of Equipment, whoever controls them, are attached to it', () => {
    const g = board();
    g.act(0).cast(armory.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BLADE, BOOTS, CLOAK);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.attached(BLADE, armory.name);
    g.expect.attached(BOOTS, armory.name);
    // Control of an Equipment does not change (CR 701.3), so the opponent still controls theirs.
    g.expect.attached(CLOAK, armory.name);
    g.expect.zone(CLOAK, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('declining the "may" attaches nothing', () => {
    const g = board();
    g.act(0).cast(armory.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BLADE);
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.attached(BLADE, null);
  });

  test('it also triggers when it attacks: Equipment is moved from another creature to it', () => {
    const g = withDefs([armory])
      .seat(0)
      .battlefield(armory.name, BEARS, BLADE)
      .library('Mountain', { count: 6 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.attached(BLADE, null);
    g.advanceTo('declareAttackers');
    g.act(0).attack(armory.name, { player: 2 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BLADE);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.attached(BLADE, armory.name);
  });
});

describe('Barret, Avalanche Leader: "attach up to one target Equipment you control to target Rebel you control"', () => {
  const board = () =>
    withDefs([barretLeader])
      .seat(0)
      .battlefield(barretLeader.name, BEARS, BLADE, CLOAK)
      .library('Mountain', { count: 6 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('upkeep', { active: 0 })
      .build();

  test('at the beginning of combat the Equipment is attached to the Rebel (Barret is a Rebel too)', () => {
    const g = board();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BLADE, barretLeader.name);
    g.passAll();
    g.expect.attached(BLADE, barretLeader.name);
    g.expect.attached(CLOAK, null);
  });

  test('a creature that is not a Rebel is not a legal destination', () => {
    const g = board();
    g.advanceTo('beginningOfCombat');
    expect(() => g.act(0).chooseTargets(BLADE, BEARS)).toThrow();
  });

  test('"up to one": the Equipment may be left where it is', () => {
    const g = board();
    g.advanceTo('beginningOfCombat');
    // The scenario's flat list fills the slots in order, so the empty first slot is answered with the raw action.
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(barretLeader.name), specId: 't2' }],
    });
    g.passAll();
    g.expect.attached(BLADE, null);
  });
});

describe('Cloud, Ex-SOLDIER (CR 701.3, 208.1)', () => {
  const board = (extra: readonly string[] = []) =>
    withDefs([cloud])
      .seat(0)
      .hand(cloud.name)
      .battlefield(
        'Mountain',
        'Mountain',
        'Forest',
        'Forest',
        'Plains',
        BLADE,
        CLOAK,
        BEARS,
        ...extra,
      )
      .library('Mountain', { count: 8 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('when it enters, up to one target Equipment you control is attached to it', () => {
    const g = board();
    g.act(0).cast(cloud.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BLADE);
    g.passAll();
    g.expect.attached(BLADE, cloud.name);
    g.expect.attached(CLOAK, null);
  });

  test('when it attacks, it draws a card for each equipped attacking creature you control (an unequipped or non-attacking one is not counted)', () => {
    const g = withDefs([cloud])
      .seat(0)
      .battlefield(cloud.name, BEARS, 'Llanowar Elves', 'Typhoid Rats')
      .battlefield(CLOAK, { attachedTo: cloud.name })
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BOOTS, { attachedTo: 'Typhoid Rats' })
      .library('Mountain', { count: 8 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    // Typhoid Rats is equipped but stays home: it is not an equipped attacking creature.
    g.act(0).attack([cloud.name, BEARS, 'Llanowar Elves'], { player: 1 });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 0 });
  });

  test('with power 7 or greater it also creates two Treasure tokens (CR 208.1)', () => {
    const g = withDefs([cloud])
      .seat(0)
      .battlefield(cloud.name, { counters: { '+1/+1': 3 } })
      .library('Mountain', { count: 8 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(cloud.name, 7, 7);
    g.advanceTo('declareAttackers');
    g.act(0).attack(cloud.name, { player: 2 });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });

  test('with power 6 no Treasure is created', () => {
    const g = withDefs([cloud])
      .seat(0)
      .battlefield(cloud.name, { counters: { '+1/+1': 2 } })
      .library('Mountain', { count: 8 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(cloud.name, { player: 2 });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 0 });
  });
});

describe('Barret Wallace: "it deals damage equal to the number of equipped creatures you control to defending player" (CR 508.5)', () => {
  const board = (attached: readonly [string, string][]) => {
    let b = withDefs([barretWallace])
      .seat(0)
      .battlefield(barretWallace.name, BEARS, 'Llanowar Elves');
    for (const [equipment, host] of attached) b = b.battlefield(equipment, { attachedTo: host });
    return b
      .library('Mountain', { count: 8 })
      .seat(1)
      .library('Mountain', { count: 6 })
      .seat(2)
      .library('Mountain', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('two equipped creatures: only the attacked player loses 2 life from the trigger', () => {
    const g = board([
      [BLADE, BEARS],
      [CLOAK, barretWallace.name],
    ]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(barretWallace.name, { player: 2 });
    g.passAll();
    g.expect.life(2, 40 - 2);
    g.expect.life(1, 40);
  });

  test('a creature with two Equipment counts once', () => {
    const g = board([
      [BLADE, BEARS],
      [CLOAK, BEARS],
    ]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(barretWallace.name, { player: 1 });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(2, 40);
  });

  test('no equipped creature: no damage', () => {
    const g = board([]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(barretWallace.name, { player: 1 });
    g.passAll();
    g.expect.life(1, 40);
  });
});

describe('Unfinished Business: "... then return up to two target Aura and/or Equipment cards from your graveyard to the battlefield attached to that creature" (CR 303.4f, 303.4g, 301.5)', () => {
  const MIGHT = 'SYNTHETIC Might Aura';
  const LAND_AURA = 'SYNTHETIC Shield Land Aura';
  const board = () =>
    withDefs([business])
      .define(syntheticCard(MIGHT))
      .define(syntheticCard(LAND_AURA))
      .seat(0)
      .hand(business.name)
      .graveyard(BEARS, BLADE, CLOAK, MIGHT, LAND_AURA)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .library('Plains', { count: 6 })
      .seat(1)
      .library('Plains', { count: 6 })
      .seat(2)
      .library('Plains', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature returns and the Equipment and the Aura come back attached to it', () => {
    const g = board();
    g.act(0).cast(business.name, { targets: [BEARS, BLADE, MIGHT], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.attached(BLADE, BEARS);
    g.expect.attached(MIGHT, BEARS);
    g.expect.zone(CLOAK, 'graveyard', { seat: 0 });
    g.expect.pt(BEARS, 6, 4);
    g.expect.invariants();
  });

  test('an Aura that cannot enchant the creature stays in the graveyard (CR 303.4g)', () => {
    const g = board();
    g.act(0).cast(business.name, { targets: [BEARS, LAND_AURA, CLOAK], pay: true });
    g.passAll();
    g.expect.zone(LAND_AURA, 'graveyard', { seat: 0 });
    g.expect.attached(CLOAK, BEARS);
    g.expect.invariants();
  });

  test('"up to two": only the creature may be chosen, and it returns alone', () => {
    const g = board();
    g.act(0).cast(business.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BLADE, 'graveyard', { seat: 0 });
  });

  test('three Auras or Equipment are too many targets', () => {
    const g = board();
    expect(() =>
      g.act(0).cast(business.name, { targets: [BEARS, BLADE, CLOAK, MIGHT], pay: true }),
    ).toThrow();
  });
});
