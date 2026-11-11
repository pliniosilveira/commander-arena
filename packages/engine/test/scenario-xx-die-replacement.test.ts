// "If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature
// token" (D-133): a replacement of a creature dying, from a permanent on the battlefield, by filter, that also makes tokens for
// the controller of the permanent.
// Pins: CR 614.1a and 614.6 (a replacement effect modifies an event as it would happen: the creature is exiled and never
// dies, so no "dies" ability triggers), CR 700.4 ("dies" is going from the battlefield to a graveyard), CR 614.5 (a
// replacement applies once to an event), CR 400.7 (an object that moves is a new object), CR 903.9a (a commander that was
// exiled may go to the command zone), CR 704.5f and 704.5g (state-based actions put it into the graveyard: replaced as well),
// CR 701.21 (sacrifice puts a permanent into the graveyard), CR 111.7 (a token that is exiled ceases to exist), CR 603.10a
// (leaves-the-battlefield abilities still trigger), CR 614.12 (a replacement is read from the battlefield as it is when the
// event happens, so permanents that die at the same time replace each other's deaths).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const COLLECTOR = 'SYNTHETIC Soul Collector'; // if a nontoken creature an opponent controls would die: exile it, a Zombie for me
const SHROUD = 'SYNTHETIC Quiet Shroud'; // if a creature would die, exile it instead
const GRAVES = 'SYNTHETIC Open Graves'; // a nontoken creature you control dies: a Zombie token
const BELL = 'SYNTHETIC Farewell Bell'; // a nontoken creature you control leaves the battlefield: gain 1
const DECAY = 'SYNTHETIC Mass Decay'; // all non-Zombie creatures get -1/-1 until end of turn
const RAISE = 'SYNTHETIC Raise Zombie';
const WRATH = 'SYNTHETIC Wrath';
const MARAUDER = 'SYNTHETIC Bag Marauder'; // enters: each player sacrifices a creature
const SKELETON = 'SYNTHETIC Plain Skeleton'; // 1/1
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  active: 0 | 1 = 0,
) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active })
    .build();
}

const lands = (b: Builder, n = 6) =>
  b
    .battlefield('Swamp', { count: n })
    .battlefield('Mountain', { count: 2 })
    .battlefield('Plains', { count: 2 })
    .battlefield('Forest', { count: 1 });

const zombieTokens = (g: ScenarioGame, seat: 0 | 1) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === 'Zombie' && o.controller === seat);

const settle = (g: ScenarioGame): void => {
  for (let i = 0; i < 40 && g.state.stack.length > 0; i += 1) g.pass();
};

describe('"would die" with a replacement: exile it and create a token (CR 614.1a, 700.4)', () => {
  test('an opponent’s nontoken creature that is destroyed is exiled, and I get a Zombie', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    expect(zombieTokens(g, 0)).toHaveLength(1);
    expect(zombieTokens(g, 1)).toHaveLength(0);
    expect(g.events.some((e) => e.kind === 'died')).toBe(false);
  });

  test('it never died: the "dies" ability of the creature, and of the opponent’s other permanents, does not trigger', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS).battlefield(GRAVES),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    expect(zombieTokens(g, 1)).toHaveLength(0);
    expect(zombieTokens(g, 0)).toHaveLength(1);
  });

  test('but it did leave the battlefield: "leaves the battlefield" abilities trigger (CR 603.10a)', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS).battlefield(BELL),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.life(1, 21);
  });

  test('my own creature dies as usual', () => {
    const g = main((b) => lands(b.hand(MURDER).battlefield(COLLECTOR).battlefield(BEARS)));
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(zombieTokens(g, 0)).toHaveLength(0);
  });

  test('a token creature of the opponent dies as usual (nontoken only)', () => {
    const g = main(
      (b) => lands(b.hand(BOLT).battlefield(COLLECTOR)),
      (b) => lands(b.hand(RAISE)),
      1,
    );
    g.act(1).cast(RAISE, { pay: true });
    settle(g);
    const token = zombieTokens(g, 1)[0];
    expect(token).toBeDefined();
    g.act(1).pass();
    g.act(0).cast(BOLT, { targets: [token?.id ?? ''], pay: true });
    settle(g);
    expect(zombieTokens(g, 1)).toHaveLength(0);
    expect(zombieTokens(g, 0)).toHaveLength(0);
  });

  test('every way to die is replaced: lethal damage (CR 704.5g)', () => {
    const g = main(
      (b) => lands(b.hand(BOLT).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(zombieTokens(g, 0)).toHaveLength(1);
  });

  test('zero toughness (CR 704.5f)', () => {
    const g = main(
      (b) => lands(b.hand(DECAY).battlefield(COLLECTOR)),
      (b) => b.battlefield(SKELETON),
    );
    g.act(0).cast(DECAY, { pay: true });
    settle(g);
    g.expect.zone(SKELETON, 'exile', { seat: 1 });
    expect(zombieTokens(g, 0)).toHaveLength(1);
  });

  test('a sacrifice (CR 701.21): the opponent sacrifices and the creature is exiled', () => {
    const g = main(
      (b) => lands(b.hand(MARAUDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(MARAUDER, { pay: true });
    for (
      let i = 0;
      i < 20 && (g.state.stack.length > 0 || g.state.pending?.kind === 'choosePermanent');
      i += 1
    ) {
      if (g.state.pending?.kind === 'choosePermanent') g.act(0).choosePermanents(MARAUDER);
      else g.pass();
    }
    g.expect.zone(ELVES, 'exile', { seat: 1 });
  });

  test('a creature that is exiled and later returned, or a commander: a commander may go to the command zone', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS, { commander: true }),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    // CR 903.9a: the owner may put it into the command zone from exile.
    expect(g.state.pending?.kind === 'commanderZone' || g.state.pending?.kind === 'priority').toBe(
      true,
    );
    if (g.state.pending?.kind === 'commanderZone') g.act(1).sendToCommandZone();
    g.expect.zone(BEARS, 'command', { seat: 1 });
  });
});

describe('a replacement of every creature: "exile it instead" (no token)', () => {
  test('both players’ creatures are exiled, mine too', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(SHROUD).battlefield(BEARS)),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(MURDER, { targets: [ELVES], pay: true });
    settle(g);
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    expect(zombieTokens(g, 0)).toHaveLength(0);
    g.expect.noObject(ELVES, { zone: 'graveyard' });
  });

  test('a token is exiled and ceases to exist', () => {
    const g = main((b) => lands(b.hand(RAISE).hand(BOLT).battlefield(SHROUD)));
    g.act(0).cast(RAISE, { pay: true });
    settle(g);
    const token = zombieTokens(g, 0)[0];
    g.act(0).cast(BOLT, { targets: [token?.id ?? ''], pay: true });
    settle(g);
    expect(zombieTokens(g, 0)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('what the replacement reads: the battlefield as it is when the event happens (CR 614.12)', () => {
  test('when the Collector is gone, nothing is replaced', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).hand(MURDER).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [COLLECTOR], pay: true });
    settle(g);
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('creatures that die at the same time as the Collector are still replaced (Wrath destroys them together)', () => {
    const g = main(
      (b) => lands(b.hand(WRATH).battlefield(COLLECTOR)),
      (b) => b.battlefield(BEARS).battlefield(ELVES),
    );
    g.act(0).cast(WRATH, { pay: true });
    settle(g);
    g.expect.zone(COLLECTOR, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    expect(zombieTokens(g, 0)).toHaveLength(2);
  });

  test('the same for state-based actions: the Collector and the opponent’s Skeleton die from -1/-1 together (CR 704.3)', () => {
    const g = main(
      (b) => lands(b.hand(DECAY)).battlefield(COLLECTOR, { counters: { '-1/-1': 3 } }),
      (b) => b.battlefield(SKELETON),
    );
    g.act(0).cast(DECAY, { pay: true });
    settle(g);
    g.expect.zone(COLLECTOR, 'graveyard', { seat: 0 });
    g.expect.zone(SKELETON, 'exile', { seat: 1 });
    expect(zombieTokens(g, 0)).toHaveLength(1);
  });

  test('another Collector of the opponent replaces my creature’s death too: each applies to creatures of the other side', () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(COLLECTOR).battlefield(BEARS)),
      (b) => lands(b).battlefield(COLLECTOR),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(zombieTokens(g, 1)).toHaveLength(1);
    expect(zombieTokens(g, 0)).toHaveLength(0);
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
  const replacement = (r: unknown) =>
    withAbilities(SHROUD, [{ kind: 'replacement', replacement: r }]);

  test('the instead is exile, a token is a preset or a custom one with a count of 1 or more', () => {
    expect(
      messages(replacement({ kind: 'wouldDie', what: { types: ['creature'] }, instead: 'exile' })),
    ).toBe('');
    expect(
      messages(
        replacement({ kind: 'wouldDie', what: { types: ['creature'] }, instead: 'graveyard' }),
      ),
    ).not.toBe('');
    expect(
      messages(
        replacement({
          kind: 'wouldDie',
          what: { types: ['creature'] },
          instead: 'exile',
          alsoCreate: { token: { kind: 'preset', preset: 'Treasure' }, count: 0 },
        }),
      ),
    ).toMatch(/count/);
    expect(
      messages(
        replacement({
          kind: 'wouldDie',
          what: { types: ['creature'] },
          instead: 'exile',
          alsoCreate: { token: { kind: 'copyOf', object: { kind: 'this' } }, count: 1 },
        }),
      ),
    ).toMatch(/token/);
  });

  test('the creature that would die is on the battlefield: no zone, and no stack kind', () => {
    expect(
      messages(
        replacement({
          kind: 'wouldDie',
          what: { types: ['creature'], zone: 'graveyard' },
          instead: 'exile',
        }),
      ),
    ).toMatch(/zone/);
  });
});
