// Ahoy Mateys deck, group 9 (amounts and damage replacement): Dire Fleet Ravager ("each player loses a third of their life, rounded up"), Shared Animosity
// ("+1/+0 until end of turn for each other attacking creature that shares a creature type with it") and Angrath's Marauders ("it deals double that damage ...
// instead"), read by the grammar and run by the engine. The first block parses the REAL Oracle text of each card from the golden corpus, whole; the rest are
// SYNTHETIC cards whose abilities are the real lines (names replaced), played through `applyAction` with the scenario DSL, plus the near misses the grammar must
// not read. Every synthetic name starts with "SYNTHETIC". Pins: CR 107.1a (rounding), CR 119.3 (life loss), CR 614.1a and 614.5 and 616.1 (replacement effects,
// one opportunity each, the affected player orders them), CR 120.3 (the same source deals the damage), CR 508.1 and 205.3m (attackers, creature types).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';

const THIRD = 'When ~ enters, each player loses a third of their life, rounded up.';
const ANIMOSITY =
  'Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it.';
const DOUBLE =
  'If a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.';
const PLUS_TWO =
  'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.';

describe('the real cards, whole', () => {
  test.each(['Dire Fleet Ravager', 'Shared Animosity', "Angrath's Marauders"])(
    '%s is supported',
    (name) => {
      const imported = real(name);
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.status).toBe('supported');
      expect(validateCard(imported.definition)).toEqual([]);
    },
  );
});

describe('the grammar reads the three lines', () => {
  test('a third of their life, rounded up: the amount of the life lost, of each player', () => {
    const [trigger] = readAll(THIRD, 'creature').abilities;
    expect(trigger).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'loseLife',
        amount: { kind: 'half', divisor: 3, round: 'up', of: { kind: 'lifeTotalOf' } },
      },
    });
  });

  test('half their life is still half (no divisor)', () => {
    const [ability] = readAll(
      'When ~ enters, each player loses half their life, rounded down.',
      'creature',
    ).abilities;
    expect(JSON.stringify(ability)).not.toContain('divisor');
  });

  test('other attacking creatures that share a type with it: counted besides the creature of the trigger', () => {
    const [ability] = readAll(ANIMOSITY, 'enchantment').abilities;
    expect(JSON.stringify(ability)).toContain('"sharesCreatureTypeWith":"triggerSubject"');
    expect(JSON.stringify(ability)).toContain('"otherThanTriggerSubject":true');
  });

  test("double the damage: any recipient, the controller's own sources", () => {
    expect(readAll(DOUBLE, 'creature').abilities).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'damageDouble', sources: { controller: 'you' } },
      },
    ]);
  });

  test('a source of a color is read as well', () => {
    expect(readAll(DOUBLE.replace('a source', 'a red source'), 'creature').abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageDouble',
          sources: { colors: ['R'], controller: 'you' },
        },
      },
    ]);
  });

  test.each([
    ['a third of their life without a rounding', THIRD.replace(', rounded up', '')],
    ['a quarter of their life', THIRD.replace('a third', 'a quarter')],
    ['a source of any player', DOUBLE.replace(' you control', '')],
    ['only an opponent as the recipient', DOUBLE.replace('a permanent or player', 'an opponent')],
    ['triple the damage', DOUBLE.replace('double', 'triple')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe('Dire Fleet Ravager: each player loses a third of their life, rounded up', () => {
  const ravager: CardDefinition = parsed(
    'SYNTHETIC Parsed Ravager',
    'Creature — Orc Pirate',
    THIRD,
    {
      manaCost: '{3}{B}{B}',
      colors: ['B'],
      power: '4',
      toughness: '4',
    },
  );

  const enters = (mine: number, theirs: number) => {
    const g = scenario()
      .seat(0)
      .define(ravager)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .hand(ravager.name)
      .library(...FILLER)
      .life(mine)
      .seat(1)
      .library(...FILLER)
      .life(theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(ravager.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(ravager)).toEqual([]);
  });

  test('each player loses their own third, rounded up (CR 107.1a): 40 -> 26, 7 -> 4', () => {
    const g = enters(40, 7);
    g.expect.life(0, 26);
    g.expect.life(1, 4);
  });

  test('an exact third loses exactly that: 9 -> 6, and 1 -> 0', () => {
    const g = enters(9, 1);
    g.expect.life(0, 6);
    g.expect.life(1, 0);
  });
});

describe("Angrath's Marauders: a source you control deals double damage", () => {
  const marauders: CardDefinition = parsed(
    'SYNTHETIC Parsed Marauders',
    'Creature — Human',
    DOUBLE,
    {
      manaCost: '{5}{R}{R}',
      colors: ['R'],
      power: '4',
      toughness: '4',
    },
  );
  const sovereign: CardDefinition = parsed(
    'SYNTHETIC Parsed Red Sovereign',
    'Creature — Dwarf',
    PLUS_TWO,
    { manaCost: '{1}{R}{R}{R}', colors: ['R'], power: '2', toughness: '4' },
  );

  const build = (...permanents: readonly string[]) =>
    scenario()
      .seat(0)
      .define(marauders)
      .define(sovereign)
      .battlefield(...permanents, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(marauders)).toEqual([]);
  });

  test('a spell of the controller deals double damage to an opponent (CR 609.7, 614.1a): 3 -> 6', () => {
    const g = build(marauders.name);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 34);
  });

  test("the recipient is any player: the controller's own life is doubled as well", () => {
    const g = build(marauders.name);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 34);
  });

  test('without it, the spell deals 3', () => {
    const g = build('Mountain');
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('combat damage of a creature of the controller is doubled (CR 120.3: the creature deals it)', () => {
    const g = scenario()
      .seat(0)
      .define(marauders)
      .battlefield('SYNTHETIC Vanilla 5/5', marauders.name)
      .seat(1)
      .battlefield('Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['SYNTHETIC Vanilla 5/5']);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 30);
  });

  test('a source of another player is not doubled', () => {
    const g = scenario()
      .seat(0)
      .define(marauders)
      .battlefield(marauders.name)
      .library(...FILLER)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
  });

  test('two effects that change the damage are applied once each, in the order the damaged player chooses (CR 614.5, 616.1): 3 doubled then +2, or +2 then doubled', () => {
    const run = (first: 'double' | 'plus') => {
      const g = build(sovereign.name, marauders.name);
      g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
      g.passAll();
      const decision = g.state.pending;
      if (decision?.kind !== 'chooseOption') throw new Error('the order is asked');
      const pick = decision.replacement?.choices.find(
        (c) => c.text.startsWith('Deal double') === (first === 'double'),
      );
      if (pick === undefined) throw new Error('both effects are offered');
      g.act(1).chooseOption(pick.option);
      return g;
    };
    run('double').expect.life(1, 32);
    run('plus').expect.life(1, 30);
  });
});

describe('Shared Animosity: +1/+0 for each other attacker that shares a creature type', () => {
  const animosity: CardDefinition = parsed('SYNTHETIC Parsed Animosity', 'Enchantment', ANIMOSITY, {
    manaCost: '{2}{R}',
    colors: ['R'],
  });
  const orcPirate: CardDefinition = parsed('SYNTHETIC Orc Pirate', 'Creature — Orc Pirate', '', {
    power: '2',
    toughness: '2',
  });
  const pirate: CardDefinition = parsed('SYNTHETIC Lone Pirate', 'Creature — Pirate', '', {
    power: '2',
    toughness: '2',
  });
  const wizard: CardDefinition = parsed('SYNTHETIC Lone Wizard', 'Creature — Wizard', '', {
    power: '2',
    toughness: '2',
  });
  const pirate2: CardDefinition = parsed('SYNTHETIC Second Pirate', 'Creature — Pirate', '', {
    power: '2',
    toughness: '2',
  });

  const attackWith = (...attackers: readonly string[]) => {
    const g = scenario()
      .seat(0)
      .define(animosity)
      .define(orcPirate)
      .define(pirate)
      .define(wizard)
      .define(pirate2)
      .battlefield(animosity.name, orcPirate.name, pirate.name, wizard.name, pirate2.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(attackers);
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, index) => index));
    }
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(animosity)).toEqual([]);
  });

  test('each attacker counts the others that share a creature type with it, each other attacker once (CR 205.3m)', () => {
    const g = attackWith(orcPirate.name, pirate.name, wizard.name);
    g.expect.pt(orcPirate.name, 3, 2); // shares Pirate with the Pirate
    g.expect.pt(pirate.name, 3, 2); // shares Pirate with the Orc Pirate
    g.expect.pt(wizard.name, 2, 2); // shares nothing
  });

  test('three that share a type: each gets +2, and the creature itself is not counted', () => {
    const g = attackWith(orcPirate.name, pirate.name, pirate2.name);
    g.expect.pt(orcPirate.name, 4, 2);
    g.expect.pt(pirate.name, 4, 2);
    g.expect.pt(pirate2.name, 4, 2);
  });

  test('a creature attacking alone has nothing to share with', () => {
    const g = attackWith(pirate.name);
    g.expect.pt(pirate.name, 2, 2);
  });

  test('a creature that does not attack is not counted', () => {
    const g = attackWith(orcPirate.name, wizard.name);
    g.expect.pt(orcPirate.name, 2, 2);
  });
});
