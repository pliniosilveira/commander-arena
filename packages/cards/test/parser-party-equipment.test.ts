// Multiclass Baldric (Oracle text): keywords that each have a condition of their own and damage prevented to the equipped creature while its controller has a full party. The grammar,
// the nodes the lowering produces and the engine running them. The Oracle lines are those of the card; the near misses are SYNTHETIC.
import { type Ability, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const KEYWORDS =
  'Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste if you control a Warrior, and flying if you control a Wizard.';
const PREVENT =
  'As long as you have a full party, prevent all damage that would be dealt to equipped creature.';
const EQUIPMENT = ['Equipment'];

const FULL_PARTY = {
  kind: 'amountIs',
  amount: { kind: 'partySize' },
  compare: { cmp: 'atLeast', value: 4 },
} as const;

const keywordStatic = (kind: string, subtype: string): Ability =>
  ({
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: { kind: 'attached', types: ['creature'] },
      keyword: { kind },
    },
    condition: {
      kind: 'controlsAtLeast',
      filter: { subtypes: [subtype] },
      count: 1,
    },
  }) as Ability;

describe('a keyword for each condition (CR 611.3a, 613.1f)', () => {
  test('one static ability for each keyword, each with its own condition', () => {
    const face = readAll(KEYWORDS, 'artifact', EQUIPMENT);
    expect(face.abilities).toEqual([
      keywordStatic('lifelink', 'Cleric'),
      keywordStatic('deathtouch', 'Rogue'),
      keywordStatic('haste', 'Warrior'),
      keywordStatic('flying', 'Wizard'),
    ]);
  });

  test('two keywords, joined with "and"', () => {
    const face = readAll(
      'Equipped creature has flying if you control a Wizard and haste if you control a Warrior.',
      'artifact',
      EQUIPMENT,
    );
    expect(face.abilities).toEqual([
      keywordStatic('flying', 'Wizard'),
      keywordStatic('haste', 'Warrior'),
    ]);
  });

  test('is not read with one keyword, a keyword with no condition, or a repeat', () => {
    for (const text of [
      'Equipped creature has lifelink if you control a Cleric, deathtouch, and flying if you control a Wizard.',
      'Equipped creature has lifelink if you control a Cleric and lifelink if you control a Rogue.',
      'Equipped creature has lifelink if you control a Cleric, flying if you control a Wizard.',
      'Equipped creature has lifelink if you control a Cleric and deathtouch if you control a banana.',
    ]) {
      expect(dropped(text, 'artifact', EQUIPMENT), text).toBeDefined();
    }
  });
});

describe('"As long as you have a full party, prevent all damage that would be dealt to equipped creature"', () => {
  test('lowers to the prevention of the attached permanent, with a full party as its condition', () => {
    const face = readAll(PREVENT, 'artifact', EQUIPMENT);
    expect(face.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'preventDamageToThis', subject: { kind: 'attached' }, scope: 'all' },
        condition: FULL_PARTY,
      },
    ]);
  });

  test('with no condition it is the prevention of the attached permanent, combat damage only', () => {
    const face = readAll(
      'Prevent all combat damage that would be dealt to enchanted creature.',
      'enchantment',
      ['Aura'],
    );
    expect(face.abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'preventDamageToThis', subject: { kind: 'attached' }, scope: 'combat' },
    });
  });

  test('is not read for another recipient, a duration or a source', () => {
    for (const text of [
      'As long as you have a full party, prevent all damage that would be dealt to you.',
      'As long as you have a full party, prevent all damage that would be dealt to equipped creature this turn.',
      'As long as you have a full party, prevent all damage that would be dealt to equipped creature by creatures.',
      "As long as you don't have a full party, prevent all damage that would be dealt to equipped creature.",
    ]) {
      expect(dropped(text, 'artifact', EQUIPMENT), text).toBeDefined();
    }
  });
});

describe('the whole card, run by the engine', () => {
  const ORACLE = `${KEYWORDS}\n${PREVENT}`;
  const lowered = readAll(ORACLE, 'artifact', EQUIPMENT).abilities;
  const base = syntheticCard('SYNTHETIC Party Aegis');
  const [baseFace] = base.faces;
  if (baseFace === undefined) throw new Error('no face');
  const NAME = 'SYNTHETIC Lowered Baldric';
  // The keywords and the prevention as the grammar lowered them; the equip ability is the one of the synthetic card.
  const equip = baseFace.abilities.filter((a) => a.kind === 'keyword');
  const card = {
    ...base,
    name: NAME,
    faces: [{ ...baseFace, name: NAME, abilities: [...lowered, ...equip] }],
  };

  const game = (party: readonly string[], seats = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .define(card)
      .library('Plains', { count: 8 })
      .battlefield('Grizzly Bears', { label: 'host' })
      .battlefield(NAME, { attachedTo: 'host' })
      .battlefield(...party);
    for (let s = 1; s < seats; s++) {
      b = b
        .seat(s as 1 | 2 | 3)
        .library('Plains', { count: 8 })
        .hand('Lightning Bolt')
        .battlefield('Mountain');
    }
    return b.at('precombatMain', { active: 1 }).build();
  };
  const CLERIC = 'SYNTHETIC Party Cleric';
  const ROGUE = 'SYNTHETIC Party Rogue';
  const WARRIOR = 'SYNTHETIC Party Warrior';
  const WIZARD = 'SYNTHETIC Party Wizard';

  test('the whole Oracle text is read: four keywords, the prevention and equip', () => {
    const whole = readAll(`${ORACLE}\nEquip {2}`, 'artifact', EQUIPMENT);
    expect(whole.abilities).toHaveLength(6);
    expect(whole.abilities.slice(0, 5)).toEqual(lowered);
  });

  test('the card is valid', () => {
    expect(validateCard(card)).toEqual([]);
  });

  test('each keyword needs its own creature type', () => {
    game([CLERIC, WIZARD]).expect.derived('host', { keywords: ['lifelink', 'flying'] });
    game([ROGUE, WARRIOR]).expect.derived('host', { keywords: ['deathtouch', 'haste'] });
    game([]).expect.derived('host', { keywords: [] });
  });

  test('with a full party the equipped creature is dealt no damage; with three of four it dies', () => {
    const full = game([CLERIC, ROGUE, WARRIOR, WIZARD]);
    full.act(1).cast('Lightning Bolt[0]', { targets: ['host'], pay: true });
    full.passAll();
    full.expect.damage('host', 0);
    full.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    const three = game([CLERIC, ROGUE, WARRIOR]);
    three.act(1).cast('Lightning Bolt[0]', { targets: ['host'], pay: true });
    three.passAll();
    three.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('in a game of three, the opponents party does not count', () => {
    const g = game([], 3);
    g.act(1).cast('Lightning Bolt[0]', { targets: ['host'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});
