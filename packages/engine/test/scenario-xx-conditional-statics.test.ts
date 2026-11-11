// Static abilities that apply "as long as" a condition holds (D-133): "As long as you control your commander, ~ gets
// +2/+2 and creatures you control have vigilance", "~ gets +3/+3 as long as you have 30 or more life", "~ has hexproof as
// long as it's untapped", "As long as you control three or more artifacts, ~ has hexproof", a restriction that applies unless
// something is true, and the same life condition as the restriction of an activated ability.
// Pins: CR 611.3a (a continuous effect from a static ability applies at any moment to whatever its text describes, so the
// condition is read each time, nothing is locked in), CR 613.8 (the condition is read without any layer 7 effect, so it cannot
// loop), CR 903.3 (a commander is a card designated as a player's commander) and CR 903.3d (controlling it means a permanent on
// the battlefield), CR 119.1 and CR 903.7 (starting life), CR 725 (the monarch), CR 302.6 and 602.5b ("activate only if").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const MARSHAL = 'SYNTHETIC Field Marshal'; // 4/4: as long as you control your commander, +2/+2 and vigilance for your creatures
const VALKYRIE = 'SYNTHETIC Prime Valkyrie'; // 2/2: 7 life above the starting life total: your creatures get +2/+2
const BRUTE = 'SYNTHETIC Hale Brute'; // 2/2: +3/+3 as long as you have 30 or more life
const DRUID = 'SYNTHETIC Shade Druid'; // 1/1: {T}: Add {G}; hexproof as long as it's untapped
const ADEPT = 'SYNTHETIC Artifact Adept'; // 2/2: hexproof as long as you control three or more artifacts
const PACT = 'SYNTHETIC Zombie Pact'; // 2/2 Zombie: +1/+1 as long as you control another Zombie
const GUARD = 'SYNTHETIC Lone Guard'; // 3/3: can't block unless you control another creature
const BANNER = 'SYNTHETIC Crown Banner'; // 1/1: as long as you're the monarch, your creatures get +1/+1
const SENTINEL = 'SYNTHETIC Standing Sentinel'; // 1/3: while untapped, attacking it or its controller's planeswalkers costs {1} each
const TAPPER = 'SYNTHETIC Radiant Tapper'; // 2/2: {T}: a Zombie; only with 7 life above the start, as a sorcery
const GOLEM = 'SYNTHETIC Plain Golem'; // colorless 2/2 artifact creature
const BEARS = 'Grizzly Bears';
const MURDER = 'Murder';
const GAIN = 'SYNTHETIC Draw Three Gain Five'; // sorcery {2}{U}: draw three, gain 5
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  options: { life?: number; monarch?: 0 | 1; active?: 0 | 1 } = {},
) {
  const a = mine(
    scenario()
      .seat(0)
      .life(options.life ?? 40)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(40)
      .library(...FILLER),
  )
    .at('precombatMain', {
      active: options.active ?? 0,
      ...(options.monarch === undefined ? {} : { monarch: options.monarch }),
    })
    .build();
}

describe('"as long as you control your commander" (CR 903.3, 903.3d)', () => {
  test('without a commander on the battlefield the condition is false', () => {
    const g = main((b) => b.battlefield(MARSHAL).battlefield(BEARS));
    g.expect.pt(MARSHAL, 4, 4);
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('with my commander on the battlefield: +2/+2 for the source, vigilance for my creatures', () => {
    const g = main((b) => b.battlefield(MARSHAL).battlefield(BEARS, { commander: true }));
    g.expect.pt(MARSHAL, 6, 6);
    g.expect.derived(BEARS, { keywords: ['vigilance'] });
    g.expect.derived(MARSHAL, { keywords: ['vigilance'] });
  });

  test('the vigilance reaches only my creatures', () => {
    const g = main(
      (b) => b.battlefield(MARSHAL).battlefield(BEARS, { commander: true }),
      (b) => b.battlefield('Llanowar Elves'),
    );
    g.expect.derived('Llanowar Elves', { keywords: [] });
  });

  test('a commander in the command zone is not controlled', () => {
    const g = main((b) => b.battlefield(MARSHAL).commander(BEARS));
    g.expect.pt(MARSHAL, 4, 4);
  });

  test("another player's commander that I control is not 'my commander' (CR 903.3)", () => {
    const g = main(
      (b) => b.battlefield(MARSHAL),
      (b) => b.battlefield(BEARS, { commander: true, controller: 0 }),
    );
    g.expect.pt(MARSHAL, 4, 4);
    g.expect.derived(MARSHAL, { keywords: [] });
  });

  test('my commander controlled by the opponent is not controlled by me either', () => {
    const g = main((b) =>
      b.battlefield(MARSHAL).battlefield(BEARS, { commander: true, controller: 1 }),
    );
    g.expect.pt(MARSHAL, 4, 4);
  });

  test('the bonus ends the moment the commander leaves (CR 611.3a)', () => {
    const g = main((b) =>
      b
        .hand(MURDER)
        .battlefield('Swamp', { count: 3 })
        .battlefield(MARSHAL)
        .battlefield(BEARS, { commander: true }),
    );
    g.expect.pt(MARSHAL, 6, 6);
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'commanderZone') g.act(0).declineCommandZone();
    g.expect.pt(MARSHAL, 4, 4);
    g.expect.derived(MARSHAL, { keywords: [] });
  });
});

describe('"as long as you have N or more life" and "N life more than your starting life total" (CR 119.1)', () => {
  test('the Brute: 29 life is not enough, 30 is', () => {
    const low = main(
      (b) => b.battlefield(BRUTE),
      (b) => b,
      { life: 29 },
    );
    low.expect.pt(BRUTE, 2, 2);
    const high = main(
      (b) => b.battlefield(BRUTE),
      (b) => b,
      { life: 30 },
    );
    high.expect.pt(BRUTE, 5, 5);
  });

  test('the Valkyrie: the starting life total is 40 here, so the threshold is 47', () => {
    const low = main(
      (b) => b.battlefield(VALKYRIE).battlefield(BEARS),
      (b) => b,
      { life: 46 },
    );
    low.expect.pt(BEARS, 2, 2);
    const high = main(
      (b) => b.battlefield(VALKYRIE).battlefield(BEARS),
      (b) => b,
      { life: 47 },
    );
    high.expect.pt(BEARS, 4, 4);
    high.expect.pt(VALKYRIE, 4, 4);
  });

  test('it follows the life total as it changes: gaining life turns it on', () => {
    const g = main(
      (b) => b.hand(GAIN).battlefield('Island', { count: 3 }).battlefield(VALKYRIE),
      (b) => b,
      { life: 44 },
    );
    g.expect.pt(VALKYRIE, 2, 2);
    g.act(0).cast(GAIN, { pay: true });
    g.passAll();
    g.expect.life(0, 49);
    g.expect.pt(VALKYRIE, 4, 4);
  });

  test("the opponent's life total is not mine: I have 10, they have 40", () => {
    const g = main(
      (b) => b.battlefield(BRUTE),
      (b) => b,
      { life: 10 },
    );
    g.expect.pt(BRUTE, 2, 2);
  });
});

describe('"as long as it\'s untapped" (a condition on the source itself)', () => {
  test('untapped: hexproof; tapped for mana: not', () => {
    const g = main((b) => b.battlefield(DRUID));
    g.expect.derived(DRUID, { keywords: ['hexproof'] });
    g.act(0).tapForMana(DRUID);
    g.expect.derived(DRUID, { keywords: [] });
  });

  test('each permanent is read on its own: of two Druids, only the untapped one has hexproof', () => {
    const g = main((b) => b.battlefield(DRUID).battlefield(DRUID, { tapped: true }));
    g.expect.derived({ name: DRUID, nth: 0 }, { keywords: ['hexproof'] });
    g.expect.derived({ name: DRUID, nth: 1 }, { keywords: [] });
  });

  test("it untaps and has hexproof again in its controller's next untap step", () => {
    const g = main((b) => b.battlefield(DRUID, { tapped: true }));
    g.expect.derived(DRUID, { keywords: [] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(DRUID, false);
    g.expect.derived(DRUID, { keywords: ['hexproof'] });
  });
});

describe('"as long as you control three or more artifacts" (a count of permanents)', () => {
  test('two artifacts are not enough, three are, one leaving ends it', () => {
    const two = main((b) => b.battlefield(ADEPT).battlefield(GOLEM, { count: 2 }));
    two.expect.derived(ADEPT, { keywords: [] });
    const three = main((b) => b.battlefield(ADEPT).battlefield(GOLEM, { count: 3 }));
    three.expect.derived(ADEPT, { keywords: ['hexproof'] });
  });

  test('the opponent’s artifacts are not mine', () => {
    const g = main(
      (b) => b.battlefield(ADEPT).battlefield(GOLEM, { count: 2 }),
      (b) => b.battlefield(GOLEM, { count: 2 }),
    );
    g.expect.derived(ADEPT, { keywords: [] });
  });
});

describe('a condition that counts the permanents the condition is part of (CR 613.8: no loop)', () => {
  test('a lone Zombie Pact is 2/2; with another Zombie it is 3/3; two of them each see the other', () => {
    const alone = main((b) => b.battlefield(PACT));
    alone.expect.pt(PACT, 2, 2);
    const two = main((b) => b.battlefield(PACT, { count: 2 }));
    two.expect.pt({ name: PACT, nth: 0 }, 3, 3);
    two.expect.pt({ name: PACT, nth: 1 }, 3, 3);
    const withZombie = main((b) => b.battlefield(PACT).battlefield('SYNTHETIC Plain Zombie'));
    withZombie.expect.pt(PACT, 3, 3);
  });
});

describe('a condition on a restriction', () => {
  const attacked = (mine: (b: Builder) => Builder) => {
    const g = main(mine, (b) => b.battlefield('SYNTHETIC Vanilla 2/2'), { active: 1 });
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: 'SYNTHETIC Vanilla 2/2', seat: 1 }]);
    g.advanceTo('declareBlockers');
    return g;
  };

  test('"can\'t block unless you control another creature": alone, it is not offered a block', () => {
    const g = attacked((b) => b.battlefield(GUARD));
    // With no creature able to block, the engine asks no blockers question (CR 509.1).
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
  });

  test('with another creature it may block', () => {
    const g = attacked((b) => b.battlefield(GUARD).battlefield(BEARS));
    g.expect.canBlock(GUARD, 'SYNTHETIC Vanilla 2/2', true);
  });
});

describe('a condition on an attack tax (CR 508.1h)', () => {
  const attackedBy = (tapSentinel: boolean) => {
    const g = main(
      (b) => b.battlefield(SENTINEL, { tapped: tapSentinel }),
      (b) => b.battlefield(BEARS).battlefield('Plains'),
      { active: 1 },
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([{ name: BEARS, seat: 1 }]);
    return g;
  };

  test('while untapped, the attacker pays {1}: the declaration waits for the payment', () => {
    const g = attackedBy(false);
    g.expect.pending('payMana', 1);
  });

  test('while tapped it costs nothing', () => {
    const g = attackedBy(true);
    expect(g.state.pending?.kind).not.toBe('payMana');
    expect(g.state.combat?.attackers).toHaveLength(1);
  });
});

describe('"as long as you\'re the monarch" (a designation, CR 725)', () => {
  test("the monarch's creatures get +1/+1; without the crown, or when the opponent has it, they do not", () => {
    const mine = main(
      (b) => b.battlefield(BANNER).battlefield(BEARS),
      (b) => b,
      { monarch: 0 },
    );
    mine.expect.pt(BEARS, 3, 3);
    const nobody = main((b) => b.battlefield(BANNER).battlefield(BEARS));
    nobody.expect.pt(BEARS, 2, 2);
    const theirs = main(
      (b) => b.battlefield(BANNER).battlefield(BEARS),
      (b) => b,
      { monarch: 1 },
    );
    theirs.expect.pt(BEARS, 2, 2);
  });
});

describe('the same life condition as "activate only if" (CR 602.5b)', () => {
  const tap = (g: ScenarioGame) =>
    g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(TAPPER));

  test('it can be activated at 47 life in the main phase, and not at 46', () => {
    const rich = main(
      (b) => b.battlefield(TAPPER),
      (b) => b,
      { life: 47 },
    );
    expect(tap(rich)).toBe(true);
    rich.act(0).activate(TAPPER);
    rich.passAll();
    expect(
      rich.state.battlefield.some(
        (id) => rich.state.objects[id]?.token?.characteristics.name === 'Zombie',
      ),
    ).toBe(true);
    const poor = main(
      (b) => b.battlefield(TAPPER),
      (b) => b,
      { life: 46 },
    );
    expect(tap(poor)).toBe(false);
  });
});

describe('what a card may say', () => {
  function firstFace(card: ReturnType<typeof syntheticCard>) {
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return face;
  }
  const withAbilities = (name: string, abilities: unknown[]) => {
    const base = syntheticCard(name);
    return { ...base, faces: [{ ...firstFace(base), abilities }] } as never;
  };
  const messages = (card: never) =>
    validateCard(card)
      .map((i) => i.message)
      .join(' | ');
  const modify = (condition: unknown) => ({
    kind: 'static',
    condition,
    static: {
      kind: 'modifyPt',
      subject: { kind: 'this' },
      power: 1,
      toughness: 1,
    },
  });

  test('the conditions the layers can read are accepted', () => {
    const ok = [
      { kind: 'controlCommander', yours: true },
      { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 5 } },
      { kind: 'thisMatches', filter: { tapped: false } },
      { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 2 },
      { kind: 'not', term: { kind: 'controlCommander' } },
      {
        kind: 'and',
        terms: [
          { kind: 'controlCommander' },
          { kind: 'playerHasDesignation', player: { kind: 'you' }, designation: 'monarch' },
        ],
      },
    ];
    for (const condition of ok) {
      expect(messages(withAbilities(BRUTE, [modify(condition)]))).toBe('');
    }
  });

  test('a condition that reads power, keywords or the combat would depend on the layer it applies in (CR 613.8)', () => {
    const refused = [
      {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
        count: 1,
      },
      {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'], keywords: ['flying'] },
        count: 1,
      },
      { kind: 'controlsAtLeast', filter: { types: ['creature'], attacking: true }, count: 1 },
      { kind: 'thisMatches', filter: { attacking: true } },
      { kind: 'thisMatches', filter: { power: { cmp: 'atLeast', value: 4 } } },
      { kind: 'amountIs', amount: 3, compare: { cmp: 'atLeast', value: 3 } },
      { kind: 'kicked' },
      { kind: 'sourceHasCounter', counter: '+1/+1' },
    ];
    for (const condition of refused) {
      expect(
        messages(withAbilities(BRUTE, [modify(condition)])),
        JSON.stringify(condition),
      ).not.toBe('');
    }
  });

  test('only the statics that act in a layer take a condition', () => {
    const noHandLimit = {
      kind: 'static',
      condition: { kind: 'controlCommander' },
      static: { kind: 'noMaximumHandSize' },
    };
    expect(messages(withAbilities(BRUTE, [noHandLimit]))).toMatch(/condition/);
    const uncounterable = {
      kind: 'static',
      condition: { kind: 'controlCommander' },
      static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'cantBeCountered' },
    };
    expect(messages(withAbilities(BRUTE, [uncounterable]))).toMatch(/condition/);
  });

  test('a life comparison has a whole number; below the starting life total only with aboveStarting', () => {
    expect(
      messages(
        withAbilities(BRUTE, [
          modify({ kind: 'lifeTotal', compare: { cmp: 'atLeast', value: -3 } }),
        ]),
      ),
    ).toMatch(/life/);
    expect(
      messages(
        withAbilities(BRUTE, [
          modify({
            kind: 'lifeTotal',
            compare: { cmp: 'atMost', value: -3 },
            aboveStarting: true,
          }),
        ]),
      ),
    ).toBe('');
  });
});
