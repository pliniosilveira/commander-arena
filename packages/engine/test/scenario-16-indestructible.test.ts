// Scenario 16 (SPEC 12): indestructible.
// Pins: CR 702.12b (Indestructible): an indestructible permanent can't be destroyed; it isn't
// destroyed by lethal damage and ignores the state-based action for lethal damage (CR 704.5g);
// CR 702.12b also covers "destroy" effects, including the ones that don't target (a sweeper);
// CR 704.5f: a creature with toughness 0 or less is put into its owner's graveyard, which is not
// destruction, so indestructible does not help; CR 701.21a (Sacrifice): moving a permanent you
// control to the graveyard is not destroying it, so a creature can be sacrificed.
// Cards: SYNTHETIC Indestructible 2/2 and the SYNTHETIC spells Shrink (-2/-2 until end of turn),
// Wrath (destroy all creatures) and Edict (sacrifice a creature), with real Lightning Bolt and
// Murder. Counters are written with the scenario `counters` option.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

const IND = 'SYNTHETIC Indestructible 2/2';
const BEARS = 'Grizzly Bears';

describe('SPEC scenario 16: indestructible (CR 702.12b)', () => {
  test('it survives lethal damage: 3 from Lightning Bolt on a 2/2 stays marked and it stays', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield(IND)
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [IND], pay: true });
    g.passAll();
    g.expect.damage(IND, 3);
    g.expect.zone(IND, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'died' });
    g.expect.pt(IND, 2, 2);
  });

  test('it survives "destroy target creature"', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(IND)
      .build();
    g.act(0).cast('Murder', { targets: [IND], pay: true });
    g.passAll();
    g.expect.zone(IND, 'battlefield', { seat: 1 });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'died' });
  });

  test('it survives a sweeper that destroys all creatures, which kills the others', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(IND, BEARS)
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    g.expect.zone(IND, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('it goes to the graveyard at toughness 0 from a -N/-N effect, damage or not (CR 704.5f)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Shrink')
      .battlefield('Swamp')
      .battlefield(IND)
      .seat(1)
      .build();
    g.expect.pt(IND, 2, 2);
    g.act(0).cast('SYNTHETIC Shrink', { targets: [IND], pay: true });
    g.passAll();
    g.expect.zone(IND, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'died', cardName: IND }]);
  });

  test('it goes to the graveyard at toughness 0 from -1/-1 counters', () => {
    const g = scenario()
      .seat(0)
      .battlefield(IND, { counters: { '-1/-1': 2 } })
      .seat(1)
      .build();
    g.expect.pt(IND, 0, 0);
    g.act(0).pass();
    g.expect.zone(IND, 'graveyard', { seat: 0 });
  });

  test('one -1/-1 counter is not enough: a 1/1 indestructible creature lives', () => {
    const g = scenario()
      .seat(0)
      .battlefield(IND, { counters: { '-1/-1': 1 } })
      .seat(1)
      .build();
    g.act(0).pass();
    g.expect.pt(IND, 1, 1);
    g.expect.zone(IND, 'battlefield', { seat: 0 });
  });

  test('lethal damage plus a toughness reduction to 0: it survived the damage, not the shrink', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Shrink')
      .battlefield('Swamp')
      .battlefield(IND, { damage: 5 })
      .seat(1)
      .build({ settle: true });
    // The state-based actions already ran once (settle): 5 damage on a 2/2 did not destroy it.
    g.expect.zone(IND, 'battlefield', { seat: 0 });
    g.expect.damage(IND, 5);
    g.act(0).cast('SYNTHETIC Shrink', { targets: [IND], pay: true });
    g.passAll();
    g.expect.zone(IND, 'graveyard', { seat: 0 });
  });

  test('it can be sacrificed (sacrifice is not destroy, CR 701.21a)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .battlefield('Swamp', 'Swamp')
      .battlefield(IND)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    g.expect.zone(IND, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'died', cardName: IND }, { kind: 'sacrificed' }]);
  });

  test('a creature without indestructible is destroyed by the same lethal damage (the control)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
