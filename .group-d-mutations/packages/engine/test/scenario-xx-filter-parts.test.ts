// New parts of an object filter (D-133): token and nontoken, "non-Zombie" (a subtype it must not have), colorless, and
// with or without a keyword. Read by statics, by "each" selectors of effects, by triggers and by counts.
// Pins: CR 111.1 (a token is a permanent that is not represented by a card), CR 205.3d (creature types), CR 105.2c (a
// colorless object has no color), CR 613.1f and 613.8 (a static ability whose subject depends on abilities would depend on
// layer 6 itself: refused), CR 611.2c (what a resolving effect affects is set as it begins).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const CAPTAIN = 'SYNTHETIC Vigil Captain'; // nontoken creatures you control get +1/+1 and have vigilance
const SERGEANT = 'SYNTHETIC Muster Sergeant'; // other nontoken creatures you control get +1/+1
const HERALD = 'SYNTHETIC Token Herald'; // creature tokens you control get +1/+1
const RAISE = 'SYNTHETIC Raise Zombie'; // create a 2/2 Zombie token
const DECAY = 'SYNTHETIC Mass Decay'; // all non-Zombie creatures get -1/-1 until end of turn
const GOLEM = 'SYNTHETIC Plain Golem'; // colorless 2/2 artifact creature
const BANNER = 'SYNTHETIC Colorless Banner'; // colorless creatures you control get +1/+1
const CLIP = 'SYNTHETIC Clip Wings'; // creatures with flying get -2/-0 until end of turn
const POUND = 'SYNTHETIC Ground Pound'; // creatures without flying get +1/+1 until end of turn
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2
const SKELETON = 'SYNTHETIC Plain Skeleton'; // 1/1
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying, vigilance

type Builder = ReturnType<typeof scenario>;

/** The Zombie token seat 0 makes with Raise Zombie. */
function withToken(place: (b: Builder) => Builder) {
  const g = twoSeatGame((b) => place(b.hand(RAISE).battlefield('Swamp', { count: 2 })));
  g.act(0).cast(RAISE, { pay: true });
  g.passAll();
  return g;
}

const token = (g: ReturnType<typeof twoSeatGame>) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .find((o) => o?.token?.characteristics.name === 'Zombie');

describe('nontoken and token (CR 111.1)', () => {
  test('"nontoken creatures you control get +1/+1 and have vigilance" leaves tokens out', () => {
    const g = withToken((b) => b.battlefield(CAPTAIN).battlefield(BEARS));
    const zombie = token(g);
    expect(zombie).toBeDefined();
    g.expect.pt(CAPTAIN, 3, 3);
    g.expect.pt(BEARS, 3, 3);
    g.expect.derived(BEARS, { keywords: ['vigilance'] });
    g.expect.pt(zombie?.id ?? '', 2, 2);
    g.expect.derived(zombie?.id ?? '', { keywords: [] });
  });

  test('"other nontoken creatures you control": the source is left out as well', () => {
    const g = withToken((b) => b.battlefield(SERGEANT).battlefield(BEARS));
    g.expect.pt(SERGEANT, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(token(g)?.id ?? '', 2, 2);
  });

  test("the opponent's nontoken creatures are not 'you control'", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(CAPTAIN),
      (b) => b.battlefield(BEARS),
    );
    g.expect.pt(BEARS, 2, 2);
  });

  test('"creature tokens you control get +1/+1" reaches tokens only', () => {
    const g = withToken((b) => b.battlefield(HERALD).battlefield(BEARS));
    g.expect.pt(token(g)?.id ?? '', 3, 3);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(HERALD, 1, 1);
  });

  test('a token that left the battlefield no longer gets it (the bonus follows the board, CR 611.3a)', () => {
    const g = withToken((b) => b.battlefield(HERALD));
    expect(token(g)).toBeDefined();
    g.expect.pt(token(g)?.id ?? '', 3, 3);
  });
});

describe('"non-Zombie": a subtype the object must not have (CR 205.3d)', () => {
  test('"all non-Zombie creatures get -1/-1 until end of turn" shrinks every creature that is not a Zombie', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(DECAY)
          .battlefield('Swamp', { count: 2 })
          .battlefield(ZOMBIE)
          .battlefield(BEARS)
          .battlefield(SKELETON),
      (b) => b.battlefield(BEARS).battlefield(ZOMBIE),
    );
    g.act(0).cast(DECAY, { pay: true });
    g.passAll();
    g.expect.pt({ name: ZOMBIE, seat: 0 }, 2, 2);
    g.expect.pt({ name: ZOMBIE, seat: 1 }, 2, 2);
    g.expect.pt({ name: BEARS, seat: 0 }, 1, 1);
    g.expect.pt({ name: BEARS, seat: 1 }, 1, 1);
    // The 1/1 Skeleton is a 0/0 and dies (CR 704.5f).
    g.expect.zone(SKELETON, 'graveyard', { seat: 0 });
  });
});

describe('colorless (CR 105.2c)', () => {
  test('"colorless creatures you control get +1/+1": an artifact creature with no color, not a black one', () => {
    const g = twoSeatGame((b) => b.battlefield(BANNER).battlefield(GOLEM).battlefield(BEARS));
    g.expect.pt(GOLEM, 3, 3);
    g.expect.pt(BANNER, 1, 1);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('with and without a keyword (CR 702)', () => {
  test('"creatures with flying get -2/-0 until end of turn"', () => {
    const g = twoSeatGame(
      (b) => b.hand(CLIP).battlefield('Swamp', { count: 2 }).battlefield(ANGEL).battlefield(BEARS),
      (b) => b.battlefield(ANGEL),
    );
    g.act(0).cast(CLIP, { pay: true });
    g.passAll();
    g.expect.pt({ name: ANGEL, seat: 0 }, 2, 4);
    g.expect.pt({ name: ANGEL, seat: 1 }, 2, 4);
    g.expect.pt(BEARS, 2, 2);
  });

  test('"creatures without flying get +1/+1 until end of turn"', () => {
    const g = twoSeatGame((b) =>
      b.hand(POUND).battlefield('Swamp', { count: 2 }).battlefield(ANGEL).battlefield(BEARS),
    );
    g.act(0).cast(POUND, { pay: true });
    g.passAll();
    g.expect.pt(ANGEL, 4, 4);
    g.expect.pt(BEARS, 3, 3);
  });

  test('several keywords: the object needs every one of them', () => {
    const g = twoSeatGame((b) =>
      b
        .hand('SYNTHETIC Pin Sentinels')
        .battlefield('Swamp', { count: 2 })
        .battlefield(ANGEL)
        .battlefield('SYNTHETIC Flying Lifelinker'),
    );
    g.act(0).cast('SYNTHETIC Pin Sentinels', { pay: true });
    g.passAll();
    // The Angel has flying and vigilance; the Construct has flying and lifelink only.
    g.expect.pt(ANGEL, 2, 4);
    g.expect.pt('SYNTHETIC Flying Lifelinker', 1, 2);
  });

  test('a keyword that was granted counts, a keyword that was lost does not', () => {
    const g = twoSeatGame((b) =>
      b.hand(CLIP).battlefield('Swamp', { count: 2 }).battlefield(CAPTAIN).battlefield(BEARS),
    );
    // The Captain gives vigilance, which is not flying: nothing changes for the filter.
    g.act(0).cast(CLIP, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
  });
});

describe('what a card may say', () => {
  test('a static ability may not use a keyword in its subject: it would depend on layer 6 itself (CR 613.8)', () => {
    const base = syntheticCard(CAPTAIN);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'static' as const,
              static: {
                kind: 'modifyPt' as const,
                subject: {
                  kind: 'filter' as const,
                  filter: { types: ['creature' as const], keywords: ['flying' as const] },
                },
                power: 1,
                toughness: 1,
              },
            },
          ],
        },
      ],
    };
    const issues = validateCard(bad);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/keyword/);
  });

  test('a keyword in a filter must be one without parameters', () => {
    const base = syntheticCard(CLIP);
    const face = base.faces[0];
    if (face === undefined || face.spell?.effect?.kind !== 'modifyPt') throw new Error('shape');
    const bad = {
      ...base,
      faces: [
        {
          ...face,
          spell: {
            effect: {
              ...face.spell.effect,
              objects: {
                kind: 'each' as const,
                filter: { types: ['creature' as const], keywords: ['ward' as const] },
              },
            },
          },
        },
      ],
    };
    expect(
      validateCard(bad)
        .map((i) => i.message)
        .join(' '),
    ).toMatch(/keyword/);
  });
});
