// Group 3 of the Danitha deck (issue 26, D-1230 to D-1233 provisional): what the real cards Kor Spiritdancer, Sage's Reverie, Winds of Rath, Ethereal Armor, Face of Divinity, Shield
// of the Oversoul, Shardmage's Rescue and Strong Back ask of the engine, as the SYNTHETIC cards of `src/cards/fixtures/synthetic-danitha-g3.ts` (the cards package checks that the
// grammar lowers the real text to the same nodes).
// Pins: CR 303.4 and 301.5 (an Aura or Equipment attached to a permanent; "enchanted" is having an Aura attached, an Equipment is no Aura), CR 611.3a (a static ability follows the
// board: the count and the condition are read each time), CR 613.1d, 613.1e and 613.8 (the type, subtype and color of the Aura and of its host are read through layers 4 and 5 before
// layer 7), CR 701.19c (it can't be regenerated), CR 400.7 (an Aura that entered this turn is the same object), CR 601.2c and 601.2f (the targets are chosen before the total cost is
// determined: a reduction that depends on them), CR 602.2b (an activation follows the same order), CR 702.6a (Equip), CR 118.7 (a reduction takes generic mana only).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { legalTargets } from '../src/rules/select';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WEAVER = 'SYNTHETIC Aura Weaver'; // 0/2: +2/+2 for each Aura attached to it; draws on an Aura cast
const SCHOLAR = 'SYNTHETIC Aura Scholar'; // Aura: draws and gives +1/+1 for each Aura you control that is attached to a creature
const PURGE = 'SYNTHETIC Bare Purge'; // destroy all creatures that aren't enchanted; can't be regenerated
const ARMOR = 'SYNTHETIC Armor of Many'; // Aura: +1/+1 for each enchantment you control and first strike
const TWIN = 'SYNTHETIC Twin Face Aura'; // Aura: +2/+2; with another Aura on the creature, first strike and lifelink
const HUE = 'SYNTHETIC Dual Hue Aura'; // Aura: green: +1/+1 and indestructible; white: +1/+1 and flying
const FLASH_WARD = 'SYNTHETIC Flash Ward Aura'; // Flash Aura: hexproof the turn it entered, +1/+1
const SPINE = 'SYNTHETIC Strong Spine Aura'; // Aura: cheaper Equip abilities and Aura spells that target its creature; +2/+2 per Aura and Equipment attached
const COSTLY = 'SYNTHETIC Costly Blade'; // Equipment: +1/+1, Equip {4}
const MIGHT = 'SYNTHETIC Might Aura'; // {1}{G} Aura +2/+2
const WINGS = 'SYNTHETIC Wings Aura'; // {1}{U} Aura: flying
const LAND_AURA = 'SYNTHETIC Shield Land Aura'; // {W} Aura on a land
const BLADE = 'SYNTHETIC Blade'; // Equipment +2/+0
const RECALLER = 'SYNTHETIC Aura Recaller'; // {1}{G}{W} 2/2 creature, green and white
const TROLL = 'SYNTHETIC Regenerating Troll'; // {1}{B}: regenerate
const CHARM = 'SYNTHETIC Regrowth Charm'; // {G}: regenerate target creature
const BEARS = 'Grizzly Bears'; // 2/2 green
const ANGEL = 'Serra Angel'; // 4/4 white flying, vigilance
const VANILLA = 'SYNTHETIC Vanilla 3/3'; // 3/3 colorless
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Whether `seat` could aim a spell at the creature `name` now (CR 115.2, 702.11b). */
function targetable(g: ScenarioGame, name: string, seat: 0 | 1): boolean {
  const spec = { id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } } as const;
  return legalTargets(g.state, spec, { controller: seat, source: null }).some(
    (t) => t.kind === 'object' && t.id === g.id(name),
  );
}

const ALL = [WEAVER, SCHOLAR, PURGE, ARMOR, TWIN, HUE, FLASH_WARD, SPINE, COSTLY];

describe('the cards are valid', () => {
  test.each(ALL)('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('ObjectFilter.attachedTo "source": "+2/+2 for each Aura attached to it"', () => {
  test('a creature with no Aura is 0/2, and each Aura attached to it adds +2/+2 besides its own bonus', () => {
    const none = scenario().seat(0).battlefield(WEAVER).seat(1).build();
    none.expect.pt(WEAVER, 0, 2);
    const one = scenario()
      .seat(0)
      .battlefield(WEAVER)
      .battlefield(MIGHT, { attachedTo: WEAVER })
      .seat(1)
      .build();
    one.expect.pt(WEAVER, 4, 6); // 0/2, Might +2/+2, one Aura +2/+2
    const two = scenario()
      .seat(0)
      .battlefield(WEAVER)
      .battlefield(MIGHT, { attachedTo: WEAVER })
      .battlefield(WINGS, { attachedTo: WEAVER })
      .seat(1)
      .build();
    two.expect.pt(WEAVER, 6, 8); // Might +2/+2, two Auras +4/+4
    two.expect.invariants();
  });

  test("an Aura of an opponent counts (it is attached to it), an Aura on another creature or an Equipment does not", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WEAVER, BEARS, BLADE)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BLADE, { attachedTo: WEAVER })
      .seat(1)
      .battlefield(WINGS)
      .build();
    // The Equipment is no Aura (CR 303.4: only an Aura enchants); the Might Aura is on the Bears.
    g.expect.pt(WEAVER, 2, 2); // 0/2 and the Blade's +2/+0
    g.expect.pt(BEARS, 4, 4);
  });

  test('an Aura controlled by an opponent attached to it counts', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WEAVER)
      .seat(1)
      .battlefield(MIGHT, { attachedTo: WEAVER })
      .build();
    g.expect.pt(WEAVER, 4, 6);
  });

  test('the count follows the board: another Aura arrives, the bonus grows (CR 611.3a)', () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield(WEAVER, 'Forest', 'Forest')
      .battlefield(WINGS, { attachedTo: WEAVER })
      .seat(1)
      .build();
    g.expect.pt(WEAVER, 2, 4); // 0/2 and one Aura: +2/+2
    g.act(0).cast(MIGHT, { targets: [WEAVER], pay: true });
    g.passAll();
    g.act(0).decline(); // the optional draw of the cast trigger
    g.passAll();
    g.expect.pt(WEAVER, 6, 8); // 0/2, Might +2/+2 and two Auras: +4/+4
  });

  test('"Whenever you cast an Aura spell, you may draw a card": an Aura spell draws, another spell does not', () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT, BOLT)
      .battlefield(WEAVER, 'Forest', 'Forest', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.act(0).cast(MIGHT, { targets: [WEAVER], pay: true });
    g.expect.stack([`${WEAVER} (ability)`, MIGHT]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });
});

describe('ObjectFilter.attachedTo "matching": "for each Aura you control that\'s attached to a creature"', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(SCHOLAR)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Forest')
      .battlefield(BEARS, VANILLA)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(WINGS, { attachedTo: VANILLA })
      .battlefield(LAND_AURA, { attachedTo: 'Forest' })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(ANGEL)
      .battlefield(MIGHT, { attachedTo: ANGEL })
      .build();

  test('the Aura draws one card for each Aura of yours on a creature, itself included; an Aura on a land or of an opponent does not count', () => {
    const g = build();
    g.act(0).cast(SCHOLAR, { targets: [BEARS], pay: true });
    g.passAll(); // the spell resolves; the trigger goes on the stack
    g.passAll();
    // Might, Wings and the Scholar: three Auras of yours on creatures.
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('the enchanted creature gets +1/+1 for each of them', () => {
    const g = build();
    g.act(0).cast(SCHOLAR, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2 + 2 + 3, 2 + 2 + 3); // Might +2/+2, three Auras +3/+3
    g.expect.pt(VANILLA, 3 + 0 + 0, 3); // Wings gives no bonus
  });

  test('an Aura attached to a land is not attached to a creature', () => {
    const g = build();
    g.act(0).cast(SCHOLAR, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(LAND_AURA, 'Forest');
    g.expect.handSize(0, 3);
  });
});

describe('ObjectFilter.enchanted: "Destroy all creatures that aren\'t enchanted. They can\'t be regenerated."', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(PURGE, CHARM)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Forest')
      .battlefield(BEARS, ANGEL, BLADE)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BLADE, { attachedTo: ANGEL })
      .seat(1)
      .battlefield(VANILLA, TROLL, 'Swamp', 'Swamp')
      .battlefield(WINGS, { attachedTo: VANILLA })
      .build();

  test('the creatures with an Aura survive, the others die: an Equipment makes nothing enchanted', () => {
    const g = build();
    g.act(0).cast(PURGE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(VANILLA, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(TROLL, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test("a regeneration shield does not save the creature (CR 701.19c: it can't be regenerated)", () => {
    const g = build();
    g.act(0).cast(CHARM, { targets: [TROLL], pay: true });
    g.passAll();
    g.act(0).cast(PURGE, { pay: true });
    g.passAll();
    g.expect.zone(TROLL, 'graveyard', { seat: 1 });
  });

  test('the Aura going away makes the creature unenchanted again', () => {
    const g = scenario()
      .seat(0)
      .hand(PURGE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(PURGE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"+1/+1 for each enchantment you control and has first strike"', () => {
  test('counts the enchantments of its controller (itself included) and gives first strike', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(ARMOR, { attachedTo: BEARS })
      .battlefield(MIGHT, { attachedTo: BEARS })
      .seat(1)
      .battlefield(WINGS, VANILLA)
      .battlefield(WINGS, { attachedTo: VANILLA })
      .build();
    // Two enchantments of seat 0: the Armor and the Might Aura (an opponent's does not count).
    g.expect.pt(BEARS, 2 + 2 + 2, 2 + 2 + 2);
    g.expect.derived(BEARS, { keywords: ['firstStrike'] });
  });
});

describe('static condition "amountIs": "As long as another Aura is attached to enchanted creature, it has first strike and lifelink."', () => {
  test('alone it gives +2/+2 only; with another Aura on the creature it gives first strike and lifelink as well', () => {
    const alone = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(TWIN, { attachedTo: BEARS })
      .seat(1)
      .build();
    alone.expect.pt(BEARS, 4, 4);
    alone.expect.derived(BEARS, { keywords: [] });
    const two = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(TWIN, { attachedTo: BEARS })
      .battlefield(WINGS, { attachedTo: BEARS })
      .seat(1)
      .build();
    two.expect.derived(BEARS, { keywords: ['firstStrike', 'lifelink', 'flying'] });
  });

  test('an Aura on another creature does not count; two of them count each other', () => {
    const other = scenario()
      .seat(0)
      .battlefield(BEARS, VANILLA)
      .battlefield(TWIN, { attachedTo: BEARS })
      .battlefield(WINGS, { attachedTo: VANILLA })
      .seat(1)
      .build();
    other.expect.derived(BEARS, { keywords: [] });
    const twins = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(TWIN, { attachedTo: BEARS, label: 'a' })
      .battlefield(TWIN, { attachedTo: BEARS, label: 'b' })
      .seat(1)
      .build();
    twins.expect.derived(BEARS, { keywords: ['firstStrike', 'lifelink'] });
  });

  test('an Equipment does not count as an Aura', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, BLADE)
      .battlefield(TWIN, { attachedTo: BEARS })
      .battlefield(BLADE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.derived(BEARS, { keywords: [] });
  });
});

describe('"As long as enchanted creature is green / white": the host is read through layers 4 and 5', () => {
  test('a green creature gets +1/+1 and indestructible', () => {
    const g = scenario().seat(0).battlefield(BEARS).battlefield(HUE, { attachedTo: BEARS }).seat(1).build();
    g.expect.pt(BEARS, 3, 3);
    g.expect.derived(BEARS, { keywords: ['indestructible'] });
  });

  test('a white creature gets +1/+1 and flying', () => {
    const g = scenario().seat(0).battlefield(ANGEL).battlefield(HUE, { attachedTo: ANGEL }).seat(1).build();
    g.expect.pt(ANGEL, 5, 5);
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
  });

  test('a creature of neither color gets nothing', () => {
    const g = scenario().seat(0).battlefield(VANILLA).battlefield(HUE, { attachedTo: VANILLA }).seat(1).build();
    g.expect.pt(VANILLA, 3, 3);
    g.expect.derived(VANILLA, { keywords: [] });
  });

  test('a green and white creature gets both: +2/+2, indestructible and flying', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RECALLER)
      .battlefield(HUE, { attachedTo: RECALLER })
      .seat(1)
      .build();
    g.expect.pt(RECALLER, 4, 4);
    g.expect.derived(RECALLER, { keywords: ['indestructible', 'flying', 'vigilance'] });
  });
});

describe('thisEnteredThisTurn: "As long as this Aura entered this turn, enchanted creature has hexproof."', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(FLASH_WARD)
      .battlefield('Plains', BEARS)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .build();

  test('the turn it enters the creature has hexproof, and a spell of an opponent can not target it', () => {
    const g = build();
    g.act(0).cast(FLASH_WARD, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(FLASH_WARD, BEARS);
    g.expect.derived(BEARS, { keywords: ['hexproof'] });
    g.expect.pt(BEARS, 3, 3);
    expect(targetable(g, BEARS, 1)).toBe(false); // an opponent can not target it
    expect(targetable(g, BEARS, 0)).toBe(true); // its controller can
  });

  test('an Aura that was already there at the start of the turn gives no hexproof', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(FLASH_WARD, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.pt(BEARS, 3, 3);
    expect(targetable(g, BEARS, 1)).toBe(true);
  });

  test('on the next turn the hexproof is gone, and the +1/+1 stays', () => {
    const g = build();
    g.act(0).cast(FLASH_WARD, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['hexproof'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.pt(BEARS, 3, 3);
    expect(targetable(g, BEARS, 1)).toBe(true);
  });
});

describe('abilityCostReduction and costReduction with targetsObject: "target enchanted creature cost {3} less"', () => {
  /** The generic mana still to pay of the payment the engine asks for now. */
  const owed = (g: ScenarioGame): string[] => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    return [...d.totalCost];
  };

  const equipGame = (spine: 'mine' | 'theirs' | 'none' = 'mine') => {
    const b = scenario()
      .seat(0)
      .battlefield(COSTLY, 'Forest', BEARS, VANILLA)
      .seat(1);
    return (
      spine === 'mine'
        ? scenario()
            .seat(0)
            .battlefield(COSTLY, 'Forest', BEARS, VANILLA)
            .battlefield(SPINE, { attachedTo: BEARS })
            .seat(1)
            .build()
        : spine === 'theirs'
          ? scenario()
              .seat(0)
              .battlefield(COSTLY, 'Forest', BEARS, VANILLA)
              .seat(1)
              .battlefield(SPINE, { attachedTo: BEARS })
              .build()
          : b.build()
    );
  };

  test('an Equip {4} that targets the enchanted creature costs {1}: one land is enough', () => {
    const g = equipGame();
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(COSTLY)),
    ).toBe(true);
    g.act(0).activate(COSTLY, { targets: [BEARS] });
    expect(owed(g)).toEqual(['1']);
  });

  test('the same Equip that targets another creature still costs {4}', () => {
    const g = equipGame();
    g.act(0).activate(COSTLY, { targets: [VANILLA] });
    expect(owed(g)).toEqual(['4']);
  });

  test('the equipped creature gets the Equipment and +2/+2 for it: the Equipment attached counts too', () => {
    const g = equipGame();
    g.act(0).activate(COSTLY, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(COSTLY, BEARS);
    // Bears 2/2, Equipment +1/+1, Spine +2/+2 for each of two attached (itself and the Equipment).
    g.expect.pt(BEARS, 2 + 1 + 4, 2 + 1 + 4);
  });

  test('without the Aura the Equip is not offered with one land', () => {
    const g = equipGame('none');
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(COSTLY)),
    ).toBe(false);
  });

  test('an Aura of an opponent on my creature reduces nothing for me ("Equip abilities you activate")', () => {
    const g = equipGame('theirs');
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(COSTLY)),
    ).toBe(false);
  });

  test('the reduction takes generic mana only and never goes below zero', () => {
    const g = scenario()
      .seat(0)
      .battlefield(COSTLY, 'Forest', BEARS)
      .battlefield(SPINE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.act(0).activate(COSTLY, { targets: [BEARS] });
    expect(owed(g)).toEqual(['1']);
    g.act(0).cancel();
    g.expect.attached(COSTLY, null);
  });

  test('an Aura spell that targets the enchanted creature costs {3} less (the generic part only)', () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', BEARS, VANILLA)
      .battlefield(SPINE, { attachedTo: BEARS })
      .seat(1)
      .build();
    // {1}{G} costs {G} when it targets the Bears: one Forest pays for it, so the cast is offered.
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === g.id(MIGHT)),
    ).toBe(true);
    g.act(0).cast(MIGHT, { targets: [BEARS] });
    expect(owed(g)).toEqual(['G']);
  });

  test('the same Aura aimed at another creature pays its whole cost', () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest', BEARS, VANILLA)
      .battlefield(SPINE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.act(0).cast(MIGHT, { targets: [VANILLA] });
    expect(owed(g)).toEqual(['1', 'G']);
  });

  test('a spell that is not an Aura is not cheaper', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', BEARS)
      .battlefield(SPINE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [BEARS] });
    expect(owed(g)).toEqual(['R']);
  });
});
