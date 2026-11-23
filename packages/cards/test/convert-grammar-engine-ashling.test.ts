// Evoke given to a spell as it is cast, and the sacrifice-and-copy trigger of the card that has it (CR 702.74a, 118.9, 603.7, 118.12a, 701.21a, 707.2): the two lines of Ashling, the
// Limitless go through the grammar (a card named SYNTHETIC with the wordings of the real card) and are played through applyAction, so the nodes the parser writes are what the engine runs.
import { getLegalActions, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

const GRANT_LINE =
  "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them. (If you cast a spell for its evoke cost, it's sacrificed when it enters.)";
const COPY_LINE =
  "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.";

const COPIER = parsed(
  'SYNTHETIC Parsed Copier',
  'Legendary Creature — Elemental Sorcerer',
  `${GRANT_LINE}\n${COPY_LINE}`,
  { manaCost: '{2}{R}', power: '4', toughness: '4', colors: ['R'] },
);
const HEAVY = parsed(
  'SYNTHETIC Parsed Heavy',
  'Creature — Elemental',
  'When ~ enters, you gain 2 life.',
  { manaCost: '{5}{G}', power: '5', toughness: '5', colors: ['G'] },
);

describe('the lines read as the engine nodes', () => {
  test('the grant and the trigger are the nodes the engine fixture is written with', () => {
    const fixture = syntheticCard('SYNTHETIC Evoke Copier');
    expect(COPIER.faces[0]?.abilities).toEqual(fixture?.faces[0]?.abilities);
  });

  test('the grant reads with another creature type, no type, and another cost', () => {
    expect(
      readAll(
        'Goblin permanent spells you cast from your hand gain evoke {2}{R} as you cast them.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'grantAlternativeCostToSpells',
          what: { subtypes: ['Goblin'], controller: 'you' },
          from: 'hand',
          alt: { kind: 'evoke', cost: [{ kind: 'mana', symbols: ['2', 'R'] }] },
        },
      },
    ]);
    expect(
      readAll(
        'Permanent spells you cast from your hand gain evoke {1} as you cast them.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'static',
        static: { kind: 'grantAlternativeCostToSpells', what: { controller: 'you' } },
      },
    ]);
  });

  test('"The token gains haste until end of turn." is the keyword of the token the instruction before made', () => {
    const [ability] = readAll(
      "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn.",
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken' },
          { kind: 'grantKeyword', objects: { kind: 'moved' }, keyword: { kind: 'haste' } },
        ],
      },
    });
  });

  test('near misses are not read: another zone, no cast, another player, another cost', () => {
    const lines = [
      'Elemental permanent spells you cast from your graveyard gain evoke {4} as you cast them.',
      'Elemental permanent spells you cast gain evoke {4} as you cast them.',
      'Elemental permanent spells your opponents cast from their hands gain evoke {4} as they cast them.',
      'Elemental permanent spells you cast from your hand gain evoke {X} as you cast them.',
      "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay 2 life.",
      "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless that player pays {W}{U}{B}{R}{G}.",
    ];
    for (const text of lines) {
      expect(read(text, 'creature').unparsed.length, text).toBeGreaterThan(0);
    }
    expect(
      dropped(
        'Elemental permanent spells you cast from your graveyard gain evoke {4} as you cast them.',
        'creature',
      ).reason,
    ).toBe('unrecognised');
  });

  test('a delayed "sacrifice it unless you pay" not after a token is made is not read (it is never about another object)', () => {
    expect(
      read(
        'Whenever you sacrifice a nontoken Elemental, draw a card. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.',
        'creature',
      ).unparsed.length,
    ).toBeGreaterThan(0);
  });
});

describe('the card, played', () => {
  const lands = ['Forest', 'Forest', 'Forest', 'Forest', 'Plains', 'Island', 'Swamp', 'Mountain'];
  const build = () =>
    scenario()
      .define(COPIER)
      .define(HEAVY)
      .seat(0)
      .hand(HEAVY.name)
      .battlefield(COPIER.name)
      .battlefield(...lands, 'Forest')
      .seat(1)
      .build();

  test('the Elemental in the hand is offered the evoke cost', () => {
    const g = build();
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.alternative === 'evoke',
    );
    expect(options).toHaveLength(1);
  });

  test('evoked: sacrificed when it enters, a hasty token copy of it is made, and it stays when its controller pays', () => {
    const g = build();
    g.act(0).cast(HEAVY.name, { alternative: 'evoke' });
    const forests = g
      .find({ name: 'Forest', zone: 'battlefield' })
      .slice(0, 4)
      .map((o) => ({ object: o.id, abilityIndex: 0 }));
    g.act(0).choose({ kind: 'payManual', taps: forests });
    g.pass(0);
    g.pass(1);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone(HEAVY.name, 'graveyard', { seat: 0 });
    const token = g.find({ name: HEAVY.name, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    expect(token[0]?.token).not.toBeNull();
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: HEAVY.name, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });

  test('evoked, and the controller does not pay: the token is sacrificed', () => {
    const g = build();
    g.act(0).cast(HEAVY.name, { alternative: 'evoke' });
    const forests = g
      .find({ name: 'Forest', zone: 'battlefield' })
      .slice(0, 4)
      .map((o) => ({ object: o.id, abilityIndex: 0 }));
    g.act(0).choose({ kind: 'payManual', taps: forests });
    g.pass(0);
    g.pass(1);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(g.find({ name: HEAVY.name, zone: 'battlefield' })).toHaveLength(0);
    g.expect.invariants();
  });
});
