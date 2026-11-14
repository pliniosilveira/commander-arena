// Living weapon (CR 702.92, D-139): "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this
// Equipment to it." The keyword is a triggered ability the engine writes itself; the token and the attachment come from one resolution.
// Pins: CR 702.92a (the ability), CR 111.2 and 111.3 (the creator controls and owns the token; its characteristics come from the
// effect), CR 301.5a (an Equipment attached to a creature), CR 704.3 and 704.5f (state-based actions are checked after the whole
// resolution, so a 0/0 Germ the Equipment pumps lives, and one it does not pump dies), CR 704.5n (an Equipment left attached to
// nothing stays on the battlefield), CR 400.7 (a token that dies is gone), CR 701.3 (Attach), CR 702.6 (Equip: moving it on).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-living.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const GERM_BLADE = 'SYNTHETIC Germ Blade'; // {3}, +2/+2, equip {2}
const COUNT_BLADE = 'SYNTHETIC Count Blade'; // {3}, +1/+1 for each artifact and/or enchantment you control
const HUSK_BLADE = 'SYNTHETIC Husk Blade'; // {3}, no bonus
const BEARS = 'Grizzly Bears';
const WARD = 'SYNTHETIC Dull Ward'; // enchantment
const TRINKET = 'SYNTHETIC Trinket 1'; // artifact

const germs = (g: ReturnType<typeof twoSeatGame>) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === 'Phyrexian Germ');

describe('the cards are valid', () => {
  test.each([GERM_BLADE, COUNT_BLADE, HUSK_BLADE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('living weapon on a card that is no Equipment is refused (CR 702.92a)', () => {
    const bad = {
      ...syntheticCard(GERM_BLADE),
      faces: [{ ...syntheticCard(GERM_BLADE).faces[0], subtypes: [] }],
    } as never;
    expect(validateCard(bad).map((i) => i.message)).toContainEqual(
      expect.stringContaining('living weapon is the ability of an Equipment'),
    );
  });
});

describe('Living weapon (CR 702.92a)', () => {
  test('the Equipment enters, makes a black Phyrexian Germ 0/0 and attaches to it: the Germ is 2/2 with +2/+2', () => {
    const g = twoSeatGame((b) => b.hand(GERM_BLADE).battlefield('Forest', { count: 3 }));
    g.act(0).cast(GERM_BLADE, { pay: true });
    g.passAll();
    const [germ] = germs(g);
    expect(germs(g)).toHaveLength(1);
    // One Germ is made, not two of which one dies as a 0/0 (CR 704.5f).
    expect(g.eventsSince(0).filter((e) => e.kind === 'tokenCreated')).toHaveLength(1);
    expect(germ).toBeDefined();
    expect(germ?.controller).toBe(0);
    expect(germ?.owner).toBe(0);
    g.expect.derived(germ?.id ?? '', {
      types: ['creature'],
      subtypes: ['Phyrexian', 'Germ'],
      colors: ['B'],
    });
    g.expect.pt(germ?.id ?? '', 2, 2);
    g.expect.attached(GERM_BLADE, germ?.id ?? null);
    g.expect.zone(GERM_BLADE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the bonus counts artifacts and/or enchantments you control: the Equipment itself, the Germ is no artifact', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(COUNT_BLADE)
        .battlefield('Forest', { count: 3 })
        .battlefield(WARD)
        .battlefield(TRINKET),
    );
    g.act(0).cast(COUNT_BLADE, { pay: true });
    g.passAll();
    const [germ] = germs(g);
    // The Equipment, the enchantment and the artifact: +3/+3.
    g.expect.pt(germ?.id ?? '', 3, 3);
  });

  test('an Equipment that gives nothing leaves a 0/0 that dies as state-based actions are checked, and stays unattached (CR 704.5f, 704.5n)', () => {
    const g = twoSeatGame((b) => b.hand(HUSK_BLADE).battlefield('Forest', { count: 3 }));
    g.act(0).cast(HUSK_BLADE, { pay: true });
    g.passAll();
    expect(germs(g)).toEqual([]);
    g.expect.zone(HUSK_BLADE, 'battlefield', { seat: 0 });
    g.expect.attached(HUSK_BLADE, null);
    g.expect.invariants();
  });

  test('the Equipment can be moved to another creature afterwards with Equip (CR 702.6a); the Germ without it dies', () => {
    const g = twoSeatGame((b) =>
      b.hand(GERM_BLADE).battlefield('Forest', { count: 5 }).battlefield(BEARS),
    );
    g.act(0).cast(GERM_BLADE, { pay: true });
    g.passAll();
    const [germ] = germs(g);
    g.act(0).activate(GERM_BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(GERM_BLADE, BEARS);
    g.expect.pt(BEARS, 4, 4);
    // The Germ is a 0/0 again: state-based actions put it into the graveyard, and a token goes away from there.
    expect(germs(g)).toEqual([]);
    expect(germ).toBeDefined();
    g.expect.invariants();
  });

  test('a Germ that is bounced is gone for good; the Equipment stays, unattached (CR 111.7, 704.5n)', () => {
    const g = twoSeatGame(
      (b) => b.hand(GERM_BLADE).battlefield('Forest', { count: 3 }),
      (b) => b.hand('Unsummon').battlefield('Island'),
    );
    g.act(0).cast(GERM_BLADE, { pay: true });
    g.passAll();
    expect(germs(g)).toHaveLength(1);
    // The opponent returns the Germ to its owner's hand: a token that leaves the battlefield ceases to exist.
    g.pass(0);
    g.act(1).cast('Unsummon', { targets: [germs(g)[0]?.id ?? ''], pay: true });
    g.passAll();
    expect(germs(g)).toHaveLength(0);
    g.expect.zone(GERM_BLADE, 'battlefield', { seat: 0 });
    g.expect.attached(GERM_BLADE, null);
  });
});
