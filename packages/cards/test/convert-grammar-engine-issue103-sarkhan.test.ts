// Parsed text is only worth something if the engine runs it as written. This test imports a SYNTHETIC card through the grammar (never through a fixture) with the
// real lines of Sarkhan, Soul Aflame (golden corpus, acceptance card of issue 103): "Dragon spells you cast cost {1} less to cast." and "Whenever a Dragon you control
// enters, you may have ~ become a copy of it until end of turn, except its name is ~ and it's legendary in addition to its other types." (CR 707.2, 707.9a, 707.9b,
// 205.4a, 611.2a, 613.2a). The names start with "SYNTHETIC" and no real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SARKHAN = parsed(
  'SYNTHETIC Parsed Sarkhan',
  'Legendary Creature — Human Shaman',
  "Dragon spells you cast cost {1} less to cast.\nWhenever a Dragon you control enters, you may have ~ become a copy of it until end of turn, except its name is ~ and it's legendary in addition to its other types.",
  { manaCost: '{1}{U}{R}', colors: ['U', 'R'], power: '2', toughness: '4' },
);
const DRAGON = parsed('SYNTHETIC Parsed Wyrm', 'Creature — Dragon', 'Flying', {
  manaCost: '{3}{R}',
  colors: ['R'],
  power: '4',
  toughness: '4',
});
const NAME = SARKHAN.name;
const FILLER = Array.from({ length: 8 }, () => 'Mountain');

const game = (mountains: number) =>
  scenario()
    .seat(0)
    .define(SARKHAN)
    .define(DRAGON)
    .battlefield(NAME)
    .hand(DRAGON.name)
    .battlefield('Mountain', { count: mountains })
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .build();

describe('"Whenever a Dragon you control enters, you may have ~ become a copy of it until end of turn, except its name is ~ and it\'s legendary in addition to its other types."', () => {
  test('the lowering is a becomeCopy of the triggering permanent that keeps the name and adds legendary', () => {
    const trigger = SARKHAN.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'entersBattlefield',
    );
    expect(JSON.stringify(trigger)).toContain(
      '"kind":"becomeCopy","objects":{"kind":"this"},"of":{"kind":"triggerSubject"}',
    );
    expect(JSON.stringify(trigger)).toContain('"keepName":true');
    expect(JSON.stringify(trigger)).toContain('"addSupertypes":["legendary"]');
  });

  test('a Dragon enters: accepting makes Sarkhan a 4/4 flying legendary Dragon named Sarkhan until end of turn', () => {
    // The Dragon costs {3}{R}, {1} less with Sarkhan on the battlefield: three Mountains pay it.
    const g = game(3);
    g.act(0).cast(DRAGON.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.derived(NAME, {
      types: ['creature'],
      supertypes: ['legendary'],
      subtypes: ['Dragon'],
      keywords: ['flying'],
    });
    g.expect.pt(NAME, 4, 4);
    // Until end of turn (CR 611.2a, 514.2): at the next turn he is the 2/4 Human Shaman again.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(NAME, 2, 4);
    g.expect.derived(NAME, { subtypes: ['Human', 'Shaman'], keywords: [] });
    g.expect.invariants();
  });

  test('"you may": declining leaves Sarkhan as he is', () => {
    const g = game(3);
    g.act(0).cast(DRAGON.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.pt(NAME, 2, 4);
  });
});

describe('"Dragon spells you cast cost {1} less to cast."', () => {
  test('the Dragon spell costs one less: {3}{R} is paid with three Mountains, and not with two', () => {
    const cheap = game(3);
    cheap.expect.legal(0, { cast: DRAGON.name });
    const dear = game(2);
    dear.expect.illegal(0, { cast: DRAGON.name });
  });
});
