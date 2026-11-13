// "Modified" (CR 700.9), the Danitha deck (issue 26), group 4 (D-1240): a permanent is modified if it has a counter on it, is equipped, or is enchanted by an Aura that
// its controller controls (an Aura an opponent controls is no modification). The engine's `ObjectFilter.modified`, read where a filter is matched against the game: an
// `each` selector, an enchant ability ("Enchant modified creature", CR 303.4a, 704.5m), a target slot. It is refused in a static ability's subject (`validateCard`).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g4.ts, synthetic-attachments.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RALLIER = 'SYNTHETIC Modified Rallier'; // 1/3: whenever it attacks, other modified creatures you control get +X/+X, X is its power
const MANTLE = 'SYNTHETIC Umbra Mantle'; // Enchant modified creature, +3/+3, Umbra armor
const BLADE = 'SYNTHETIC Blade'; // Equipment +2/+0, equip {1}
const MIGHT = 'SYNTHETIC Might Aura'; // Enchant creature +2/+2
const WINGS = 'SYNTHETIC Wings Aura'; // Enchant creature, flying
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const ISAMARU = 'Isamaru, Hound of Konda';
const LIBRARY = ['Island', 'Island', 'Island'] as const;

function attackBoard() {
  return scenario()
    .seat(0)
    .battlefield(RALLIER)
    .battlefield(BEARS, { counters: { '+1/+1': 1 } })
    .battlefield(SPIDER)
    .battlefield(BLADE, { attachedTo: SPIDER })
    .battlefield(ELVES)
    .battlefield(ISAMARU)
    .battlefield(MIGHT, { attachedTo: ISAMARU })
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('"other modified creatures you control get +X/+X, where X is this creature\'s power" (CR 700.9)', () => {
  test('a counter, an Equipment and an Aura its controller controls modify a creature; the trigger pumps those and no other', () => {
    const g = attackBoard();
    g.playCombat({ attack: [RALLIER], until: 'declareBlockers' });
    g.passAll();
    g.expect.pt(BEARS, 2 + 1 + 1, 2 + 1 + 1);
    g.expect.pt(SPIDER, 2 + 2 + 1, 4 + 1);
    g.expect.pt(ISAMARU, 2 + 2 + 1, 2 + 2 + 1);
    g.expect.pt(ELVES, 1, 1);
    // The attacker is not "other", although it is as modified as it gets only by this trigger: it has no counter, Equipment or Aura.
    g.expect.pt(RALLIER, 1, 3);
    g.expect.invariants();
  });

  test('the attacker itself is never pumped by its own trigger, even when it is modified', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RALLIER, { counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { counters: { '+1/+1': 2 } })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [RALLIER], until: 'declareBlockers' });
    g.passAll();
    // X is the power of the Rallier as the trigger resolves: 1 + the counter.
    g.expect.pt(RALLIER, 2, 4);
    g.expect.pt(BEARS, 4 + 2, 4 + 2);
  });

  test('an Aura an opponent controls is no modification (CR 700.9); a creature of the opponent is not pumped', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RALLIER)
      .battlefield(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(SPIDER, { counters: { '+1/+1': 1 } })
      .battlefield(WINGS, { attachedTo: BEARS })
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [RALLIER], until: 'declareBlockers' });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(SPIDER, 3, 5);
  });
});

describe('"Enchant modified creature" (CR 303.4a, 704.5m)', () => {
  function modifiedBoard(aura: string) {
    return scenario()
      .seat(0)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .battlefield(SPIDER)
      .battlefield('Forest', 'Forest')
      .hand(aura)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  }

  test('the Aura can target only a modified creature: the creature with a counter is the one legal target', () => {
    const g = modifiedBoard(MANTLE);
    g.act(0).cast(MANTLE, {});
    const decision = g.state.pending;
    expect(decision?.kind).toBe('targets');
    if (decision?.kind === 'targets') {
      expect(decision.specs[0]?.legal).toMatchObject([{ kind: 'object', id: g.id(BEARS) }]);
    }
  });

  test('cast on the creature with a counter it resolves, stays attached and gives +3/+3', () => {
    const g = modifiedBoard(MANTLE);
    g.act(0).cast(MANTLE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(MANTLE, BEARS);
    g.expect.pt(BEARS, 2 + 1 + 3, 2 + 1 + 3);
  });

  test('the Aura is itself a modification: it stays when the counters that made the creature modified are gone (CR 700.9, 704.5q)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { counters: { '+1/+1': 1, '-1/-1': 1 } })
      .battlefield(MANTLE, { attachedTo: BEARS })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.counters(BEARS, {});
    // Enchanted by an Aura its controller controls, so still modified: the Aura is legal.
    g.expect.attached(MANTLE, BEARS);
  });

  test('an Aura controlled by the opponent is no modification: when the counters are gone the creature is not modified and the Aura falls off (CR 704.5m)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { counters: { '+1/+1': 1, '-1/-1': 1 } })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(MANTLE, { attachedTo: BEARS })
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.counters(BEARS, {});
    g.expect.zone(MANTLE, 'graveyard', { seat: 1 });
  });
});

describe("Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power (CR 601.2f, 208.1)", () => {
  function castBoard(
    creatures: readonly (readonly [string, object?])[],
    lands: readonly string[],
    hand: readonly string[],
  ) {
    const s = scenario().seat(0);
    for (const [name, options] of creatures) s.battlefield(name, options);
    return s
      .battlefield(...lands)
      .hand(...hand)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  }

  test('an Aura costs {1} less with a power of 1: {1}{G} is paid with one Forest; without the creature it cannot be', () => {
    const g = castBoard([[RALLIER]], ['Forest'], [MIGHT]);
    expect(g.act(0).try.cast(MIGHT).ok).toBe(true);
    const without = castBoard([[BEARS]], ['Forest'], [MIGHT]);
    expect(without.act(0).try.cast(MIGHT).ok).toBe(false);
  });

  test('it follows the power as it is when the spell is cast: two +1/+1 counters make an Equipment of {1} free, never below zero', () => {
    const g = castBoard([[RALLIER, { counters: { '+1/+1': 2 } }]], [], [BLADE]);
    g.expect.pt(RALLIER, 3, 5);
    expect(g.act(0).try.cast(BLADE).ok).toBe(true);
  });

  test('only Aura and Equipment spells are reduced: a creature spell costs what it costs', () => {
    const g = castBoard([[RALLIER]], ['Forest'], [BEARS]);
    // Grizzly Bears costs {1}{G}: one Forest is not enough.
    expect(g.act(0).try.cast(BEARS).ok).toBe(false);
  });
});

describe('the AST: where "modified" may stand (validateCard)', () => {
  const card = (subjectFilter: object) =>
    singleFace({
      name: 'SYNTHETIC Modified Anthem Check',
      manaCost: ['1', 'G'],
      types: ['enchantment'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'Modified creatures you control get +1/+1.',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: subjectFilter },
            power: 1,
            toughness: 1,
          },
        },
      ],
    });

  test('a static ability cannot name modified creatures in its subject: derive matches it before the attachments are known', () => {
    const issues = validateCard(card({ types: ['creature'], modified: true, controller: 'you' }));
    expect(issues.map((i) => i.message).join('\n')).toMatch(/cannot name attacking creatures/);
  });

  test('the flag is true when present, and only a permanent can be modified', () => {
    const wrong = validateCard(card({ types: ['creature'], modified: false as never }));
    expect(wrong.map((i) => i.path).join('\n')).toMatch(/modified/);
    const zone = validateCard(card({ types: ['creature'], modified: true, zone: 'graveyard' }));
    expect(zone.map((i) => i.message).join('\n')).toMatch(
      /only a permanent on the battlefield can be modified/,
    );
  });

  test('a plain static ability without it is fine', () => {
    expect(validateCard(card({ types: ['creature'], controller: 'you' }))).toEqual([]);
  });
});
