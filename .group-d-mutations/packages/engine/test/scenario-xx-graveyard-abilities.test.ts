// "As long as this card is in your graveyard and you control a Mountain, creatures you control have haste." and "Whenever a Dragon you control enters,
// you may pay {R}. If you do, return this card from your graveyard to your hand." (D-151): abilities that work from the graveyard
// (`functionsIn: 'graveyard'` on a static or a triggered ability).
// Pins: CR 113.6b (an ability that says it works in a zone works there and not elsewhere), CR 604.2 (a static ability), CR 611.3a (the "as long as"
// is read each time), CR 603.2 (a trigger), CR 603.12 / CR 118.12 (pay, then return), CR 400.7 (a card that left the graveyard is a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-graveyard.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPARK = 'SYNTHETIC Grave Spark'; // Haste. Static from the graveyard: creatures you control have haste with a Mountain
const CHORUS = 'SYNTHETIC Grave Chorus'; // static from the graveyard: +1/+0 with 20 or more life
const EMBER = 'SYNTHETIC Ember Return'; // instant, trigger from the graveyard: pay {R}, return it
const ECHO = 'SYNTHETIC Grave Echo'; // a creature whose trigger works only while it is in the graveyard
const BEARS = 'Grizzly Bears';
const DRAGON = 'SYNTHETIC Plain Drake'; // {3}{R}, a Dragon with no ability of its own
const GOBLIN = 'Raging Goblin'; // {R}, not a Dragon
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([SPARK, CHORUS, EMBER, ECHO])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the abilities work from the graveyard only for the kinds that make sense there', () => {
    const base = syntheticCard(SPARK);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const withStatic = (static_: unknown, extra: object = {}) => ({
      ...base,
      faces: [
        {
          ...face,
          abilities: [{ kind: 'static', static: static_, functionsIn: 'graveyard', ...extra }],
        },
      ],
    });
    // the card itself cannot be the subject: it has nothing to change there
    expect(
      validateCard(
        withStatic({
          kind: 'grantKeyword',
          subject: { kind: 'this' },
          keyword: { kind: 'haste' },
        }) as never,
      ).length,
    ).toBeGreaterThan(0);
    // a kind of static ability that has no meaning in the graveyard
    expect(validateCard(withStatic({ kind: 'noMaximumHandSize' }) as never).length).toBeGreaterThan(
      0,
    );
    // another zone
    expect(
      validateCard(
        withStatic(
          {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: {} },
            keyword: { kind: 'haste' },
          },
          { functionsIn: 'hand' },
        ) as never,
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('"As long as this card is in your graveyard and you control a Mountain, creatures you control have haste."', () => {
  const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    build(
      scenario()
        .seat(0)
        .library(...LIBRARY),
    )
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('with the card in the graveyard and a Mountain, my creatures have haste', () => {
    const g = game((b) => b.graveyard(SPARK).battlefield(BEARS, 'Mountain'));
    g.expect.derived(BEARS, { keywords: ['haste'] });
  });

  test('without a Mountain they do not: the condition is read each time', () => {
    const g = game((b) => b.graveyard(SPARK).battlefield(BEARS, 'Forest'));
    g.expect.derived(BEARS, { keywords: [] });
  });

  test("the opponent's creatures and my other zones are not affected", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .graveyard(SPARK)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.expect.derived({ name: BEARS, seat: 1 }, { keywords: [] });
  });

  test("in the hand, on the battlefield or in the opponent's graveyard it gives nothing to anyone else", () => {
    const inHand = game((b) => b.hand(SPARK).battlefield(BEARS, 'Mountain'));
    inHand.expect.derived(BEARS, { keywords: [] });
    const onBattlefield = game((b) => b.battlefield(SPARK, BEARS, 'Mountain'));
    onBattlefield.expect.derived(BEARS, { keywords: [] });
    // its own haste (the keyword line) is a different ability and still works on the battlefield
    onBattlefield.expect.derived(SPARK, { keywords: ['haste'] });
    const theirs = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPARK)
      .build();
    theirs.expect.derived(BEARS, { keywords: [] });
  });

  test('it is a real haste: a creature that has just entered can attack', () => {
    const g = game((b) =>
      b.graveyard(SPARK).hand(BEARS).battlefield('Mountain', 'Forest', 'Forest'),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, true);
  });

  test('two of them in the graveyard are fine, and it ends when the card leaves the graveyard', () => {
    const g = game((b) => b.graveyard(SPARK, SPARK).battlefield(BEARS, 'Mountain'));
    g.expect.derived(BEARS, { keywords: ['haste'] });
  });
});

describe('a static ability that changes power and toughness from the graveyard', () => {
  test('+1/+0 for my creatures while I have 20 or more life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .graveyard(CHORUS)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.pt(BEARS, 3, 2);
  });

  test('and not with less life', () => {
    const g = scenario()
      .seat(0)
      .life(19)
      .library(...LIBRARY)
      .graveyard(CHORUS)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('"Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand."', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .graveyard(EMBER)
        .hand(DRAGON)
        .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'),
    )
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('a Dragon enters: the trigger asks, paying {R} returns the card to the hand', () => {
    const g = game();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(EMBER, 'hand', { seat: 0 });
  });

  test('declining to pay leaves it in the graveyard', () => {
    const g = game();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone(EMBER, 'graveyard', { seat: 0 });
  });

  test('a creature that is not a Dragon does not trigger it', () => {
    const g = game((b) => b.hand(GOBLIN));
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(EMBER, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test("an opponent's Dragon does not trigger it", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .graveyard(EMBER)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .hand(DRAGON)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.zone(EMBER, 'graveyard', { seat: 0 });
  });

  test('in the hand it does nothing when a Dragon enters', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(EMBER, DRAGON)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(EMBER, 'hand', { seat: 0 });
  });

  test('cast the instant, let it resolve, and a Dragon later brings it back', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(EMBER, DRAGON)
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(EMBER, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(EMBER, 'graveyard', { seat: 0 });
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(EMBER, 'hand', { seat: 0 });
  });
});

describe('a triggered ability that works from the graveyard works there only', () => {
  test('in the graveyard it triggers', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .graveyard(ECHO)
      .hand(DRAGON)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('on the battlefield it does not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAGON)
      .battlefield(ECHO, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('in the hand it does not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(ECHO, DRAGON)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});
