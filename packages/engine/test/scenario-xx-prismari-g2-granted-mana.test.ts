// The Prismari deck (issue 87), group 2: Galazeth Prismari, "Artifacts you control have \"{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell.\""
// (SYNTHETIC Prism Dragon, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 613.1f (a static ability gives the mana ability to every artifact its controller controls, as they are
// now), CR 605.1a (it is a mana ability), CR 106.6 (mana that may be spent only on certain spells: it can pay for those and nothing else), CR 106.4 (mana empties as the step ends:
// the restriction travels with the mana), CR 204/205.2 (a Treasure is an artifact: it has the ability too, beside its own).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DRAGON = 'SYNTHETIC Prism Dragon';
const TRINKET = 'SYNTHETIC Prismari Trinket'; // artifact {2}
const CANTRIP = 'SYNTHETIC Prismari Cantrip'; // instant {U}
const APPRENTICE = 'SYNTHETIC Prismari Apprentice'; // creature {1}{R}
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(extra: (b: Builder) => void = () => {}, withDragon = true) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  if (withDragon) b.battlefield(DRAGON, { label: 'dragon' });
  b.battlefield(TRINKET, { label: 'trinket' });
  extra(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('the card is valid', () => {
  test(DRAGON, () => {
    expect(validateCard(syntheticCard(DRAGON))).toEqual([]);
  });
});

describe('artifacts you control have "{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell." (CR 613.1f, 106.6)', () => {
  test('an artifact taps for one mana of any color, and that mana pays for an instant', () => {
    const g = build((b) => b.hand(CANTRIP));
    g.act(0).tapForMana('trinket', { color: 'U' });
    expect(g.state.seats[0]?.manaPool).toHaveLength(1);
    g.act(0).cast(CANTRIP, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
    expect(g.find({ name: CANTRIP, zone: 'graveyard', seat: 0 })).toHaveLength(1);
  });

  test('without the Dragon the artifact has no mana ability', () => {
    const g = build(() => {}, false);
    expect(() => g.act(0).tapForMana('trinket')).toThrow(/no mana ability/);
  });

  test('that mana cannot pay for a creature spell: it can not be cast with it alone', () => {
    const g = build((b) => b.hand(APPRENTICE).battlefield('Mountain'));
    g.act(0).tapForMana('trinket', { color: 'R' });
    // One restricted mana and one Mountain: {1}{R} cannot be paid with the artifact's mana.
    expect(g.act(0).try.cast(APPRENTICE, { pay: true }).ok).toBe(false);
  });

  test('a creature spell is paid with other mana while the restricted mana stays unused in the pool', () => {
    const g = build((b) => b.hand(APPRENTICE).battlefield('Mountain', { count: 2 }));
    g.act(0).tapForMana('trinket', { color: 'R' });
    g.act(0).cast(APPRENTICE, { pay: true });
    // The two Mountains paid; the artifact's mana is still there.
    expect(g.state.seats[0]?.manaPool).toHaveLength(1);
    expect(g.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      types: ['instant', 'sorcery'],
    });
  });

  test('the Treasure the Dragon makes is an artifact too: its own sacrifice ability and the tap ability', () => {
    const g = build(
      (b) =>
        b.hand(DRAGON).battlefield('Island', { count: 2 }).battlefield('Mountain', { count: 2 }),
      false,
    );
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.passAll();
    const treasure = g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 });
    expect(treasure).toHaveLength(1);
    // Its own ability (the first): sacrifice for mana of any color, with no restriction. The granted tap ability is the second.
    g.act(0).tapForMana(treasure[0]?.id as string, { color: 'B', ability: 1 });
    expect(g.state.seats[0]?.manaPool.map((m) => m.restriction?.kind)).toEqual(['spellMatch']);
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('the restriction does not make the Dragon itself a mana source: it is not an artifact', () => {
    const g = build();
    expect(() => g.act(0).tapForMana('dragon')).toThrow(/no mana ability/);
  });

  test('an artifact of the opponent does not get it', () => {
    const g = build((b) => b.seat(1).battlefield(TRINKET, { label: 'theirs' }));
    expect(() => g.act(1).tapForMana('theirs')).toThrow(/no mana ability/);
  });
});
