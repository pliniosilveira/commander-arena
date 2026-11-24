// Counter Intelligence deck, group 1 (Sunburst and the colors of the mana spent): the REAL Oracle text of Etched Oracle, Pentad Prism, Lux Artillery, Solar Array and Crystalline Crawler
// (golden.jsonl, taken from issue 93) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction.
// Pins: CR 702.44a (Sunburst: a +1/+1 counter for each color of mana spent to cast it as a creature, otherwise a charge counter), CR 702.44b (only as a resolving spell, only for colored mana),
// CR 702.44d (each instance works separately), CR 105.1 (colorless is no color), CR 601.2h (the mana spent on the spell), CR 603.7, 603.7a, 603.7b, 514.2 (a delayed "when you next cast ... this turn"),
// CR 603.4 (an intervening "if" is checked when the ability would trigger and when it resolves), CR 122.1 (counters of every kind), CR 614.12 (enters with counters).
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const ORACLE = real('Etched Oracle'); // {4} artifact creature 0/0, sunburst
const PRISM = real('Pentad Prism'); // {2} artifact, sunburst; remove a charge counter: add one mana of any color
const LUX = real('Lux Artillery'); // {4}
const SOLAR = real('Solar Array'); // {3}
const CRAWLER = real('Crystalline Crawler'); // {4} artifact creature 1/1, converge

// An artifact creature and an artifact with no ability of their own: what the two granters give sunburst to.
const GOLEM = parsed('SYNTHETIC Golem', 'Artifact Creature — Golem', '', {
  manaCost: '{4}',
  power: '2',
  toughness: '2',
});
const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{2}' });
const ZAP = parsed('SYNTHETIC Zap', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});
const COLORLESS_RING = parsed('SYNTHETIC Ring', 'Artifact', '{T}: Add {C}{C}.', {
  manaCost: '{1}',
});

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const FOUR_COLORS = ['Plains', 'Island', 'Swamp', 'Mountain'];

describe('the five cards read as supported and are valid', () => {
  test.each([ORACLE, PRISM, LUX, SOLAR, CRAWLER])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

/** A game where seat 0 holds `spell` and controls `lands` (and any permanent `more` places). */
const castGame = (
  spell: string,
  lands: readonly string[],
  more: (b: ReturnType<typeof scenario>) => void = () => undefined,
) => {
  const b = scenario({ seats: 4 })
    .define(ORACLE)
    .define(PRISM)
    .define(LUX)
    .define(SOLAR)
    .define(CRAWLER)
    .define(GOLEM)
    .define(TRINKET)
    .define(ZAP)
    .define(COLORLESS_RING)
    .seat(0)
    .library(...LIBRARY)
    .hand(spell)
    .battlefield(...lands);
  more(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .seat(2)
    .library(...LIBRARY)
    .seat(3)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
};

describe('Sunburst (CR 702.44a): a creature enters with a +1/+1 counter for each color of mana spent', () => {
  test('four colors of mana: four +1/+1 counters on the 0/0 artifact creature', () => {
    const g = castGame(ORACLE.name, FOUR_COLORS);
    g.act(0).cast(ORACLE.name, { pay: true });
    g.passAll();
    g.expect.zone(ORACLE.name, 'battlefield', { seat: 0 });
    g.expect.counters(ORACLE.name, { '+1/+1': 4 });
    g.expect.pt(ORACLE.name, 4, 4);
    g.expect.invariants();
  });

  test('one color spent four times is one color: one counter (the number of colors, not of mana)', () => {
    const g = castGame(ORACLE.name, ['Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(ORACLE.name, { pay: true });
    g.passAll();
    g.expect.counters(ORACLE.name, { '+1/+1': 1 });
  });

  test('colorless mana is no color (CR 105.1, 702.44b): colorless mana only is a 0/0 that dies', () => {
    const g = castGame(ORACLE.name, ['SYNTHETIC Ring', 'SYNTHETIC Ring'], (b) => b);
    g.act(0).cast(ORACLE.name, { pay: true });
    g.passAll();
    // No colored mana was spent: no counter, and a 0/0 creature is put into the graveyard (CR 704.5f).
    g.expect.zone(ORACLE.name, 'graveyard', { seat: 0 });
  });

  test('two colors and two colorless: two counters', () => {
    const g = castGame(ORACLE.name, ['Plains', 'Island', 'SYNTHETIC Ring'], (b) => b);
    g.act(0).cast(ORACLE.name, { pay: true });
    g.passAll();
    g.expect.counters(ORACLE.name, { '+1/+1': 2 });
  });
});

describe('Sunburst on a noncreature artifact: charge counters', () => {
  test('Pentad Prism cast with white and blue enters with two charge counters and removes one for a mana', () => {
    const g = castGame(PRISM.name, ['Plains', 'Island']);
    g.act(0).cast(PRISM.name, { pay: true });
    g.passAll();
    g.expect.counters(PRISM.name, { charge: 2 });
    g.act(0).tapForMana(PRISM.name, { color: 'W' });
    g.expect.counters(PRISM.name, { charge: 1 });
    g.expect.invariants();
  });
});

describe('Converge on the permanent that enters (CR 105.1, 601.2h, 614.12)', () => {
  test('Crystalline Crawler enters with a +1/+1 counter for each color of mana spent', () => {
    const g = castGame(CRAWLER.name, ['Plains', 'Island', 'Swamp', 'Plains']);
    g.act(0).cast(CRAWLER.name, { pay: true });
    g.passAll();
    g.expect.counters(CRAWLER.name, { '+1/+1': 3 });
    g.expect.pt(CRAWLER.name, 4, 4);
  });

  test('a creature that is not cast with mana gets none (it is not a spell: nothing was spent)', () => {
    const g = castGame(ORACLE.name, [], (b) => b.battlefield(CRAWLER.name));
    // Put straight onto the battlefield by the scenario: no spell, so no mana spent and no counters.
    g.expect.counters(CRAWLER.name, {});
  });
});

describe('Lux Artillery: "Whenever you cast an artifact creature spell, it gains sunburst."', () => {
  test('an artifact creature spell enters with counters for its colors; the trigger is above the spell', () => {
    const g = castGame(GOLEM.name, FOUR_COLORS, (b) => b.battlefield(LUX.name));
    g.act(0).cast(GOLEM.name, { pay: true });
    g.expect.stack([`${LUX.name} (ability)`, GOLEM.name]);
    g.passAll();
    g.expect.counters(GOLEM.name, { '+1/+1': 4 });
    g.expect.pt(GOLEM.name, 6, 6);
  });

  test('without Lux Artillery the same spell has no counters', () => {
    const g = castGame(GOLEM.name, FOUR_COLORS);
    g.act(0).cast(GOLEM.name, { pay: true });
    g.passAll();
    g.expect.counters(GOLEM.name, {});
  });

  test('an artifact spell that is no creature does not trigger it', () => {
    const g = castGame(TRINKET.name, ['Plains', 'Island'], (b) => b.battlefield(LUX.name));
    g.act(0).cast(TRINKET.name, { pay: true });
    g.expect.stack([TRINKET.name]);
    g.passAll();
    g.expect.counters(TRINKET.name, {});
  });

  test('each instance works separately (CR 702.44d): a printed sunburst and two Lux Artillery are three', () => {
    const g = castGame(ORACLE.name, FOUR_COLORS, (b) =>
      b.battlefield(LUX.name).battlefield(LUX.name),
    );
    g.act(0).cast(ORACLE.name, { pay: true });
    g.expect.pending('orderTriggers', 0); // the two triggers of the two Lux Artillery
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.counters(ORACLE.name, { '+1/+1': 12 });
  });

  test('the creature spell of an opponent is not given sunburst', () => {
    const b = scenario({ seats: 4 })
      .define(GOLEM)
      .define(LUX)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LUX.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(GOLEM.name)
      .battlefield(...FOUR_COLORS)
      .seat(2)
      .library(...LIBRARY)
      .seat(3)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 4 });
    const g = b.build();
    g.act(1).cast(GOLEM.name, { pay: true });
    g.expect.stack([GOLEM.name]);
    g.passAll();
    g.expect.counters(GOLEM.name, {});
  });
});

describe('Lux Artillery: ten damage to each opponent with thirty counters among artifacts and creatures you control', () => {
  const lux = (counters: { artifact: number; creature: number; land?: number }) =>
    scenario({ seats: 4 })
      .define(LUX)
      .define(GOLEM)
      .define(TRINKET)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LUX.name)
      .battlefield(TRINKET.name, { counters: { charge: counters.artifact } })
      .battlefield(GOLEM.name, { counters: { '+1/+1': counters.creature } })
      .battlefield('Forest', { counters: { charge: counters.land ?? 0 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .seat(3)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('counters of every kind on artifacts and creatures add up: 12 and 18 are thirty, and every opponent loses 10', () => {
    const g = lux({ artifact: 12, creature: 18 });
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 30);
    g.expect.life(2, 30);
    g.expect.life(3, 30);
  });

  test('twenty-nine is not enough (the ability does not trigger), and a land does not count', () => {
    const g = lux({ artifact: 12, creature: 17, land: 5 });
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
    g.expect.life(3, 40);
  });
});

describe('Solar Array: "When you next cast an artifact spell this turn, that spell gains sunburst."', () => {
  // Red from the Solar Array and the colors of the lands are all the mana there is, so the colors spent are known.
  const array = (spell: string, lands: readonly string[]) =>
    castGame(spell, lands, (b) => {
      b.battlefield(SOLAR.name);
    });

  test('tapped for mana, then the next artifact spell gains sunburst: charge counters for the colors spent', () => {
    const g = array(TRINKET.name, ['Plains']);
    g.act(0).tapForMana(SOLAR.name, { color: 'R' });
    g.act(0).cast(TRINKET.name, { pay: true });
    g.expect.stack([`${SOLAR.name} (ability)`, TRINKET.name]);
    g.passAll();
    // {2} paid with red from the Solar Array and white from the Plains: two colors, two charge counters.
    g.expect.counters(TRINKET.name, { charge: 2 });
    g.expect.invariants();
  });

  test('a creature spell enters with +1/+1 counters instead', () => {
    const g = array(GOLEM.name, ['Plains', 'Island', 'Swamp']);
    g.act(0).tapForMana(SOLAR.name, { color: 'R' });
    g.act(0).cast(GOLEM.name, { pay: true });
    g.passAll();
    g.expect.counters(GOLEM.name, { '+1/+1': 4 });
    g.expect.pt(GOLEM.name, 6, 6);
  });

  test('only the next artifact spell: a spell that is no artifact does not use it up (CR 603.7b), the second artifact spell gets none', () => {
    const b = scenario({ seats: 4 })
      .define(SOLAR)
      .define(TRINKET)
      .define(ZAP)
      .seat(0)
      .library(...LIBRARY)
      .hand(ZAP.name, TRINKET.name, TRINKET.name)
      .battlefield(SOLAR.name, 'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .seat(3)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 });
    const g = b.build();
    g.act(0).tapForMana(SOLAR.name, { color: 'R' });
    g.act(0).cast(ZAP.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${TRINKET.name}[0]`, { pay: true });
    g.passAll();
    const first = g.find({ name: TRINKET.name, zone: 'battlefield' });
    expect(first).toHaveLength(1);
    expect((first[0]?.counters.charge ?? 0) >= 1).toBe(true);
    g.act(0).cast(TRINKET.name, { pay: true });
    g.passAll();
    const both = g.find({ name: TRINKET.name, zone: 'battlefield' });
    expect(both).toHaveLength(2);
    expect(both.filter((o) => (o.counters.charge ?? 0) === 0)).toHaveLength(1);
  });

  test('it ends with the turn (CR 514.2): the delayed ability is gone when the next turn of its controller begins', () => {
    const g = array(TRINKET.name, ['Plains']);
    g.act(0).tapForMana(SOLAR.name, { color: 'R' });
    expect(g.state.delayedTriggers).toHaveLength(1);
    // Four players: the next turn of seat 0 is turn 7.
    for (let i = 0; i < 4; i += 1) g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 7 });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });
});

describe('what is read and what is not (the wordings next to the real ones)', () => {
  const status = (typeLine: string, text: string, manaCost = '{3}') =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Probe',
        typeLine,
        oracleText: text.replaceAll('~', 'SYNTHETIC Probe'),
        manaCost,
        ...(typeLine.includes('Creature') ? { power: '1', toughness: '1' } : {}),
      }),
    ).support.status;

  test('a creature spell of a cast trigger gains sunburst: read, as the engine node of the spell of the trigger', () => {
    const card = parsed(
      'SYNTHETIC Forge',
      'Artifact',
      'Whenever you cast a creature spell, it gains sunburst.',
      { manaCost: '{3}' },
    );
    expect(card.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'spellGainsKeyword',
        spell: { kind: 'triggerSubject' },
        keyword: { kind: 'sunburst' },
      },
    });
  });

  test('sunburst is the keyword of the card, and "gains sunburst" for a duration or of something that is no spell is not read', () => {
    expect(status('Artifact', 'Sunburst')).toBe('supported');
    expect(status('Artifact Creature — Golem', 'Flying, sunburst', '{4}')).toBe('supported');
    expect(
      status('Artifact', 'When ~ enters, target creature gains sunburst until end of turn.'),
    ).toBe('unsupported');
    expect(status('Artifact', 'Whenever ~ becomes tapped, it gains sunburst.')).toBe('unsupported');
    expect(
      status(
        'Artifact',
        'Whenever you cast a creature spell, it gains sunburst until end of turn.',
      ),
    ).toBe('unsupported');
    expect(
      status('Artifact', 'Whenever you cast a creature spell, it gains sunburst and haste.'),
    ).toBe('unsupported');
  });

  test('the colors of the mana spent: only of the permanent that enters', () => {
    expect(
      status(
        'Artifact Creature — Golem',
        '~ enters with a +1/+1 counter on it for each color of mana spent to cast it.',
        '{4}',
      ),
    ).toBe('supported');
    expect(
      status(
        'Artifact',
        '~ enters with a +1/+1 counter on it for each color of mana spent to cast that spell.',
      ),
    ).toBe('unsupported');
    expect(
      status(
        'Artifact',
        '~ enters with two +1/+1 counters on it for each color of mana spent to cast it.',
      ),
    ).toBe('unsupported');
  });

  test('counters among a group: thirty or more, of every kind, and a kind of counter is not read', () => {
    const text = (when: string) =>
      `At the beginning of your end step, if ${when}, you gain 1 life.`;
    expect(
      status(
        'Artifact',
        text('there are thirty or more counters among artifacts and creatures you control'),
      ),
    ).toBe('supported');
    expect(
      status(
        'Artifact',
        text('there are thirty or more +1/+1 counters among creatures you control'),
      ),
    ).toBe('unsupported');
  });
});
