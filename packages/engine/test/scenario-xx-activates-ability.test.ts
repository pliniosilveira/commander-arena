// "Whenever an opponent activates an ability of a permanent that isn't a mana ability" (issue 104, CR 602.2, 603.2, 605.1a): the engine's `activatesAbility` trigger.
// Pins: CR 602.2 (the ability is activated as it goes on the stack), CR 605.1a (a mana ability is no such ability: it never uses the stack), CR 603.2 (a trigger), CR 603.2 / 603.4
// ("This ability triggers only once each turn"), CR 113.6 (an ability of a card in a hand is no ability of a permanent: Cycling).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-activates-ability.ts, synthetic-gisa-g2.ts, synthetic-abilities.ts) or real fixtures (Grizzly Bears, Llanowar Elves).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WATCHER = 'SYNTHETIC Ability Watcher'; // an opponent activates: a 1/1 Zombie for the controller, once each turn
const OWN = 'SYNTHETIC Own Ability Watcher'; // you activate: gain 1 life
const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
const CYCLER = 'SYNTHETIC Cycling Bear'; // Cycling {2}
const ELVES = 'Llanowar Elves'; // {T}: Add {G}
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

describe('the cards are valid', () => {
  test.each([WATCHER, OWN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the player is relative to the controller and must be one of the three', () => {
    const base = syntheticCard(WATCHER);
    const face = base.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability === undefined) throw new Error('no ability');
    const withWho = (who: unknown) => ({
      ...base,
      faces: [{ ...face, abilities: [{ ...ability, trigger: { kind: 'activatesAbility', who } }] }],
    });
    expect(validateCard(withWho('you') as never)).toEqual([]);
    expect(validateCard(withWho('any') as never)).toEqual([]);
    expect(validateCard(withWho('me') as never).length).toBeGreaterThan(0);
  });
});

describe('Whenever an opponent activates an ability of a permanent', () => {
  const game = () =>
    scenario()
      .define(syntheticCard(WATCHER))
      .define(syntheticCard(NEEDLE))
      .define(syntheticCard(CYCLER))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WATCHER)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(NEEDLE, { label: 'myNeedle' })
      .battlefield(ELVES)
      .seat(1)
      .library(...LIBRARY)
      .hand(CYCLER)
      .battlefield('Forest', 'Forest')
      .battlefield(NEEDLE, { label: 'theirNeedle' })
      .battlefield(ELVES, { label: 'theirElves' })
      .at('precombatMain', { active: 1 })
      .build();

  test('an opponent activating an ability of a permanent makes a 1/1 white Zombie', () => {
    const g = game();
    g.act(1).activate('theirNeedle', { targets: ['mine'] });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt('Zombie[0]', 1, 1);
    g.expect.invariants();
  });

  test('it triggers only once each turn: the second activation makes nothing', () => {
    const g = scenario()
      .define(syntheticCard(WATCHER))
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WATCHER)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(NEEDLE, { label: 'a' })
      .battlefield(NEEDLE, { label: 'b' })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).activate('a', { targets: ['mine'] });
    g.passAll();
    g.act(1).activate('b', { targets: ['mine'] });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 1 });
  });

  test('a mana ability is not read: it never uses the stack', () => {
    const g = game();
    g.act(1).tapForMana('theirElves');
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 0 });
  });

  test('an ability of a card in a hand (Cycling) is no ability of a permanent', () => {
    const g = game();
    g.act(1).activate(CYCLER, { pay: true });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 0 });
  });

  test('your own activation does not trigger "an opponent"', () => {
    const g = scenario()
      .define(syntheticCard(WATCHER))
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WATCHER)
      .battlefield(NEEDLE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(NEEDLE, { targets: ['theirs'] });
    g.passAll();
    g.expect.zone('Zombie', 'battlefield', { seat: 0, count: 0 });
  });
});

describe('Whenever you activate an ability of a permanent', () => {
  test('the controller activating an ability gains 1 life; an opponent doing so does not', () => {
    const g = scenario()
      .define(syntheticCard(OWN))
      .define(syntheticCard(NEEDLE))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OWN)
      .battlefield(NEEDLE, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(NEEDLE, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('mine', { targets: ['theirs'] });
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 40);
  });
});
