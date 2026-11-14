// "Enchanted creature doesn't untap unless that player is the monarch", "You may cast artifact spells as though they had flash" and "has the power,
// toughness and creature types of the last creature card exiled with it" (D-139).
// Pins: CR 502.3 (untap step: effects can keep permanents from untapping), CR 725 (the monarch is a player), CR 303.4b and 301.5a (an Aura's
// ability applies to the permanent it enchants), CR 601.3b and 702.8a (casting as though a spell had flash: the permission is about timing only),
// CR 607.2a (linked abilities: "exiled with"), CR 613.1d and 613.4b (layers 4 and 7b), CR 400.7 (a permanent that left and came back forgets).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-statics-artifacts.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const CHAINS = 'SYNTHETIC Chill Chains';
const LEASH = 'SYNTHETIC Monarch Leash';
const ARTISAN = 'SYNTHETIC Swift Artisan'; // artifact spells you cast have flash
const SUMMONER = 'SYNTHETIC Swift Summoner'; // creature spells
const CHEAP = 'SYNTHETIC Swift Cheapskate'; // mana value 2 or less
const TWIN = 'SYNTHETIC Shape Twin'; // 2/4 Shapeshifter, imprint a nontoken creature
const MIMIC = 'SYNTHETIC Grave Mimic'; // 1/1 Mimic, {1}: exile a creature card from a graveyard
const TRINKET = 'SYNTHETIC Trinket 2';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const ELF = 'SYNTHETIC Elf 3/3';
const ANGEL = 'Serra Angel';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('the cards are valid', () => {
  test.each([CHAINS, LEASH, ARTISAN, SUMMONER, CHEAP, TWIN, MIMIC])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a linked exile with nothing that reads it, and a reader with nothing that exiles, are refused', () => {
    const twin = syntheticCard(TWIN);
    const face = twin.faces[0];
    if (face === undefined) throw new Error('no face');
    const noReader = { ...twin, faces: [{ ...face, abilities: face.abilities.slice(0, 1) }] };
    expect(validateCard(noReader).map((i) => i.message)).toContainEqual(
      expect.stringContaining('read by a takeFromLinkedExile'),
    );
    const noExile = { ...twin, faces: [{ ...face, abilities: face.abilities.slice(1) }] };
    expect(validateCard(noExile).map((i) => i.message)).toContainEqual(
      expect.stringContaining('needs an ability whose exile effect says linked'),
    );
  });
});

describe('"Enchanted creature doesn\'t untap during its controller\'s untap step unless that player is the monarch" (CR 502.3, 725)', () => {
  /** Seat 1's end step of turn 2: the next turn is seat 0's, whose creature is enchanted and tapped. */
  function beforeUntap(aura: string, monarch: 0 | 1 | undefined) {
    return scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(BEARS, { tapped: true, label: 'host' })
      .seat(1)
      .library(...FILLER)
      .battlefield(aura, { attachedTo: 'host' })
      .at('end', { active: 1, turn: 2, ...(monarch === undefined ? {} : { monarch }) })
      .build();
  }

  test('its controller is not the monarch: it stays tapped', () => {
    const g = beforeUntap(CHAINS, 1);
    g.advanceTo('upkeep');
    g.expect.tapped('host', true);
  });

  test('nobody is the monarch: it stays tapped', () => {
    const g = beforeUntap(CHAINS, undefined);
    g.advanceTo('upkeep');
    g.expect.tapped('host', true);
  });

  test('its controller is the monarch: it untaps (the condition is read as the untap step begins)', () => {
    const g = beforeUntap(CHAINS, 0);
    g.advanceTo('upkeep');
    g.expect.tapped('host', false);
  });

  test("\"unless you're the monarch\" names the Aura's controller: the enchanter being the monarch lets it untap, the enchanted creature's controller does not", () => {
    const mine = beforeUntap(LEASH, 1);
    mine.advanceTo('upkeep');
    mine.expect.tapped('host', false);
    const theirs = beforeUntap(LEASH, 0);
    theirs.advanceTo('upkeep');
    theirs.expect.tapped('host', true);
  });

  test('entering: "tap enchanted creature and you become the monarch"', () => {
    const g = twoSeatGame(
      (b) => b.hand(CHAINS).battlefield('Island', { count: 3 }),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(CHAINS, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(CHAINS, BEARS);
    g.expect.tapped(BEARS, true);
    g.expect.monarch(0);
    g.expect.invariants();
  });
});

describe('"You may cast artifact spells as though they had flash" (CR 601.3b)', () => {
  const canCast = (g: ReturnType<typeof twoSeatGame>, card: string): boolean =>
    g.legalActions(0).some((a) => a.kind === 'castSpell' && a.object === g.id(card));

  test('an artifact spell can be cast at instant timing with the permission, a creature spell cannot', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(ARTISAN).hand(TRINKET).hand(BEARS).battlefield('Forest', { count: 4 }),
    );
    // Seat 1's turn, seat 0 holding priority with an empty stack.
    const at = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(ARTISAN)
      .hand(TRINKET)
      .hand(BEARS)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(canCast(at, TRINKET)).toBe(true);
    expect(canCast(at, BEARS)).toBe(false);
    expect(canCast(g, TRINKET)).toBe(true);
  });

  test('without the permission an artifact is cast only at sorcery timing', () => {
    const at = scenario()
      .seat(0)
      .library(...FILLER)
      .hand(TRINKET)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(canCast(at, TRINKET)).toBe(false);
  });

  test("with a spell on the stack the permitted spell may still be cast; the permission is the controller's only", () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .hand(TRINKET)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .battlefield(ARTISAN)
      .hand(BEARS)
      .battlefield('Forest', { count: 2 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    g.pass(1);
    // Seat 0 has priority with a spell on the stack: its artifact is not permitted by the opponent's permanent.
    expect(canCast(g, TRINKET)).toBe(false);
  });

  test('over another filter: creature spells, or spells with mana value 2 or less', () => {
    const make = (permanent: string, card: string) =>
      scenario()
        .seat(0)
        .library(...FILLER)
        .battlefield(permanent)
        .hand(card)
        .battlefield('Forest', { count: 5 })
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 1, priority: 0 })
        .build();
    expect(canCast(make(SUMMONER, BEARS), BEARS)).toBe(true);
    expect(canCast(make(SUMMONER, TRINKET), TRINKET)).toBe(false);
    expect(canCast(make(CHEAP, BEARS), BEARS)).toBe(true);
    // Serra Angel has mana value 5.
    expect(canCast(make(CHEAP, ANGEL), ANGEL)).toBe(false);
  });

  test('cast at instant speed, the spell resolves as usual', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(ARTISAN)
      .hand(TRINKET)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.act(0).cast(TRINKET, { pay: true });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
  });
});

describe('"has the power, toughness and creature types of the last creature card exiled with it. It\'s still a Shapeshifter" (CR 607.2a)', () => {
  test('imprint: it exiles a creature and becomes that card, keeping its own other types', () => {
    const g = twoSeatGame(
      (b) => b.hand(TWIN).battlefield('Island', { count: 6 }),
      (b) => b.battlefield(ELF),
    );
    g.expect.pt(ELF, 3, 3);
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    // Optional ("you may"), with a target: the trigger asks for the target first.
    g.act(0).chooseTargets(ELF);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(ELF, 'exile', { seat: 1 });
    g.expect.pt(TWIN, 3, 3);
    g.expect.derived(TWIN, { types: ['artifact', 'creature'], subtypes: ['Elf', 'Shapeshifter'] });
    g.expect.invariants();
  });

  test('declined: nothing is exiled and it stays 2/4', () => {
    const g = twoSeatGame(
      (b) => b.hand(TWIN).battlefield('Island', { count: 6 }),
      (b) => b.battlefield(ELF),
    );
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ELF);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(ELF, 'battlefield', { seat: 1 });
    g.expect.pt(TWIN, 2, 4);
    g.expect.derived(TWIN, { subtypes: ['Shapeshifter'] });
  });

  test('the last card exiled counts: three exiled with the Mimic, the last one gives the power and the types', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(MIMIC)
        .battlefield('Plains', { count: 4 })
        .graveyard(BEARS)
        .graveyard(ELF)
        .graveyard(GOBLIN)
        .graveyard(TRINKET),
    );
    g.expect.pt(MIMIC, 1, 1);
    g.act(0).activate(MIMIC, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(MIMIC, 2, 2);
    g.expect.derived(MIMIC, { subtypes: ['Bear', 'Mimic'] });
    g.act(0).activate(MIMIC, { targets: [ELF], pay: true });
    g.passAll();
    g.expect.pt(MIMIC, 3, 3);
    g.expect.derived(MIMIC, { subtypes: ['Elf', 'Mimic'] });
    g.act(0).activate(MIMIC, { targets: [GOBLIN], pay: true });
    g.passAll();
    g.expect.pt(MIMIC, 1, 1);
    g.expect.derived(MIMIC, { subtypes: ['Goblin', 'Berserker', 'Mimic'] });
    g.expect.invariants();
  });

  test('a card that is not a creature card does not count: exiling an artifact card changes nothing', () => {
    const g = twoSeatGame((b) => b.battlefield(MIMIC).battlefield('Plains').graveyard(TRINKET));
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('counters apply on top of the set power and toughness (layer 7c after 7b)', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(MIMIC, { counters: { '+1/+1': 2 } })
        .battlefield('Plains')
        .graveyard(ELF),
    );
    g.act(0).activate(MIMIC, { targets: [ELF], pay: true });
    g.passAll();
    g.expect.pt(MIMIC, 5, 5);
  });

  test('a Mimic that left the battlefield and came back is a new object with no card exiled with it (CR 400.7)', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(MIMIC).battlefield('Plains').graveyard(ELF),
      (b) => b.hand('Unsummon').battlefield('Island'),
    );
    g.act(0).activate(MIMIC, { targets: [ELF], pay: true });
    g.pass(0);
    g.act(1).cast('Unsummon', { targets: [MIMIC], pay: true });
    g.passAll();
    g.expect.zone(MIMIC, 'hand', { seat: 0 });
    g.expect.zone(ELF, 'exile', { seat: 0 });
  });
});
