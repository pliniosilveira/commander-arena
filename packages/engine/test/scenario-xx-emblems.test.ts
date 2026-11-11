// Emblems (CR 114, D-201). Pins: CR 114.1 and 114.2 ("You get an emblem" puts an object in your command zone), 114.3 (no characteristics but its
// abilities), 114.4 (its abilities work from the command zone), 114.5 (it cannot be removed: no effect or state-based action takes it away), 704.5d
// (the emblem is not a token that ceases to exist), 603.2 (a triggered ability of an emblem triggers and uses the stack), 120.3 (the damage is dealt
// by the emblem). The emblems of the three SYNTHETIC rites are written from the real wording of the ultimates of Elspeth, Sun's Champion and
// Chandra, Torch of Defiance (the owner's golden corpus).
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ANTHEM = 'SYNTHETIC Anthem Emblem Rite';
const BURN = 'SYNTHETIC Burn Emblem Rite';
const BEARS = 'Grizzly Bears';

const emblems = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat: 0 | 1) =>
  getView(g.state, seat).seats[seat]?.command.filter((o) => o.name === 'Emblem') ?? [];

describe('getting an emblem (CR 114.1, 114.2, 114.3)', () => {
  test('the emblem is an object in the command zone of the player who got it, with the text and no characteristics', () => {
    const g = scenario().seat(0).hand(ANTHEM).battlefield('Plains', 'Plains', 'Plains').build();
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    const [e] = emblems(g, 0);
    expect(emblems(g, 0)).toHaveLength(1);
    expect(emblems(g, 1)).toHaveLength(0);
    expect(e?.zone).toBe('command');
    expect(e?.owner).toBe(0);
    expect(e?.controller).toBe(0);
    expect(e?.types).toEqual([]);
    expect(e?.subtypes).toEqual([]);
    expect(e?.colors).toEqual([]);
    expect(e?.manaCost).toBeNull();
    expect(e?.power).toBeNull();
    expect(e?.oracleText).toBe('Creatures you control get +2/+2 and have flying.');
    g.expect.eventLog([{ kind: 'emblemCreated', seat: 0 }]);
    // It is not a permanent: the battlefield has no emblem.
    expect(getView(g.state, 0).battlefield.some((o) => o.name === 'Emblem')).toBe(false);
  });

  test('the emblems of two rites are two objects, and both abilities apply', () => {
    const g = scenario()
      .seat(0)
      .hand(ANTHEM, ANTHEM)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .build();
    g.act(0).cast(`${ANTHEM}[0]`, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    expect(emblems(g, 0)).toHaveLength(2);
    g.expect.pt(BEARS, 6, 6);
  });
});

describe('the static abilities of an emblem (CR 114.4)', () => {
  test("creatures its controller controls get +2/+2 and have flying, the opponent's do not", () => {
    const g = scenario()
      .seat(0)
      .hand(ANTHEM)
      .battlefield('Plains', 'Plains', 'Plains', BEARS)
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.pt(BEARS, 2, 2);
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain('flying');
    g.expect.pt('Giant Spider', 2, 4);
    expect(g.view(0).battlefield.find((o) => o.name === 'Giant Spider')?.keywords).not.toContain(
      'flying',
    );
  });

  test('it applies to a creature that enters later, and goes on as the turns pass', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .hand(ANTHEM, 'SYNTHETIC Vanilla 2/2')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    g.act(0).cast('SYNTHETIC Vanilla 2/2', { pay: true });
    g.passAll();
    g.expect.pt('SYNTHETIC Vanilla 2/2', 4, 4);
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.pt('SYNTHETIC Vanilla 2/2', 4, 4);
    expect(emblems(g, 0)).toHaveLength(1);
  });
});

describe('the triggered ability of an emblem (CR 114.4, 603.2)', () => {
  test('"Whenever you cast a spell, this emblem deals 2 damage to any target": it goes on the stack and deals the damage', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN, 'Lightning Bolt')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(BURN, { pay: true });
    g.passAll();
    expect(emblems(g, 0)).toHaveLength(1);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    // The emblem's trigger asks for its target as it goes on the stack.
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.expect.stack(['Emblem (ability)', 'Lightning Bolt']);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 37);
  });

  test('the spells of the opponent do not trigger it', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(BURN, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
  });
});

describe('an emblem cannot be removed (CR 114.5)', () => {
  test('it is not a token that ceases to exist, and no effect names it', () => {
    const g = scenario().seat(0).hand(ANTHEM).battlefield('Plains', 'Plains', 'Plains').build();
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    g.expect.invariants();
    expect(emblems(g, 0)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(emblems(g, 0)).toHaveLength(1);
  });
});

describe('the command zone holds an emblem and a commander together (CR 114.2, 903.6)', () => {
  test('both are objects of the zone, the commander can still be cast and the emblem is never offered', () => {
    const g = scenario()
      .seat(0)
      .hand(ANTHEM)
      .commander('Isamaru, Hound of Konda', { label: 'cmd' })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast(ANTHEM, { pay: true });
    g.passAll();
    expect(emblems(g, 0)).toHaveLength(1);
    const command = getView(g.state, 0).seats[0]?.command ?? [];
    expect(command.map((o) => o.name).sort()).toEqual(['Emblem', 'Isamaru, Hound of Konda']);
    g.expect.legal(0, { cast: 'Isamaru, Hound of Konda' });
    g.act(0).cast('Isamaru, Hound of Konda', { pay: true });
    g.passAll();
    g.expect.pt('Isamaru, Hound of Konda', 4, 4);
    g.expect.invariants();
  });
});

describe('validation', () => {
  test('the rites are executable, and an emblem needs static or triggered abilities', () => {
    expect(validateCard(syntheticCard(ANTHEM))).toEqual([]);
    expect(validateCard(syntheticCard(BURN))).toEqual([]);
    const bad = {
      ...syntheticCard(ANTHEM),
      faces: [
        {
          ...syntheticCard(ANTHEM).faces[0],
          spell: {
            effect: {
              kind: 'createEmblem' as const,
              text: '',
              abilities: [
                {
                  kind: 'activated' as const,
                  cost: [{ kind: 'tap' as const }],
                  effect: { kind: 'draw' as const, player: { kind: 'you' as const }, count: 1 },
                },
              ],
            },
          },
        },
      ],
    };
    expect(
      validateCard(bad as never)
        .map((i) => i.message)
        .join('|'),
    ).toContain('static and triggered abilities');
    const none = JSON.parse(JSON.stringify(syntheticCard(ANTHEM)));
    none.faces[0].spell.effect.abilities = [];
    expect(
      validateCard(none)
        .map((i) => i.message)
        .join('|'),
    ).toContain('at least one ability');
  });
});
