// "Enchant player" (issue 159, CR 303.4, 303.4c, 508.3b, 702.5a, 702.5d, 704.5m), with the SYNTHETIC Dread Curse of the engine's fixtures:
// an Aura that is cast on a player, enters attached to them, triggers when they are attacked, and falls off when they leave the game.
import { describe, expect, test } from 'vitest';
import { illegalAuras } from '../src/rules/attach';
import { scenario } from '../src/testing/index';

const CURSE = 'SYNTHETIC Dread Curse';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const board = (active = 0) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(CURSE)
    .battlefield('Swamp', 'Swamp', BEARS)
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .at('precombatMain', { active, turn: active === 0 ? 3 : 4 })
    .build();

describe('casting and entering', () => {
  test('the Aura is cast on a player and enters attached to that player, not to a permanent (CR 303.4, 702.5d)', () => {
    const g = board();
    g.act(0).cast(CURSE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(CURSE, 'battlefield', { seat: 0 });
    const aura = g.find({ name: CURSE, zone: 'battlefield' })[0];
    expect(aura?.enchantedPlayer).toBe(1);
    expect(aura?.attachedTo).toBeNull();
    g.expect.invariants();
  });

  test('a permanent is not a legal target (CR 702.5d)', () => {
    const g = board();
    expect(() => g.act(0).cast(CURSE, { targets: [BEARS], pay: true })).toThrow();
  });

  test('the controller may enchant themselves (any player, CR 702.5a)', () => {
    const g = board();
    g.act(0).cast(CURSE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(g.find({ name: CURSE, zone: 'battlefield' })[0]?.enchantedPlayer).toBe(0);
  });
});

describe('"Whenever enchanted player is attacked" (CR 508.3b, 303.4m)', () => {
  test('one trigger for the declaration, however many creatures attack the enchanted player', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(CURSE)
      .battlefield('Swamp', 'Swamp', BEARS, 'Llanowar Elves')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(CURSE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const before = g.state.seats[0]?.life ?? 0;
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS, 'Llanowar Elves']);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('an attack on another player does not trigger it: I enchant myself and attack the opponent', () => {
    const g = board();
    g.act(0).cast(CURSE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    const before = g.state.seats[0]?.life ?? 0;
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(before);
  });
});

describe('state-based action CR 704.5m: the enchanted player left the game (CR 303.4c)', () => {
  test('an Aura attached to a player who has lost is illegal; one attached to a player in the game is not', () => {
    const g = board();
    g.act(0).cast(CURSE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(illegalAuras(g.state)).toEqual([]);
    const lost = {
      ...g.state,
      seats: g.state.seats.map((s, i) => (i === 1 ? { ...s, hasLost: true } : s)),
    };
    expect(illegalAuras(lost).map((o) => o.id)).toEqual([
      g.find({ name: CURSE, zone: 'battlefield' })[0]?.id,
    ]);
  });

  test('an Aura that enchants a player and names none is illegal too (CR 704.5m: not attached to anything)', () => {
    const g = board();
    g.act(0).cast(CURSE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const aura = g.find({ name: CURSE, zone: 'battlefield' })[0];
    if (aura === undefined) throw new Error('the Aura is not on the battlefield');
    const { enchantedPlayer: _gone, ...bare } = aura;
    const orphan = { ...g.state, objects: { ...g.state.objects, [aura.id]: bare } };
    expect(illegalAuras(orphan).map((o) => o.id)).toEqual([aura.id]);
  });
});
