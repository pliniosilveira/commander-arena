// Stage P41 (M56): the expensive singles of the Korvold deck, read by the grammar (D-188; the engine's one-or-more sacrifice, "up to that many" targets, the
// count of attacks, the main-phase condition, the added combat phase and the cards exiled face down, D-187, ENGINE_VERSION 42). The lines of the first tests
// are the real Oracle text of the three cards of the slice (the owner's request file of 2026-10-29), names replaced by ~, each with the nodes the grammar
// produces for it; the other tests read lines that say the same things over other words and numbers, and the lines a rule must not read (flagged, never
// half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in convert-grammar-engine-p41.test.ts; a missing engine feature is
// named in parser-p41-needs.test.ts.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

const CREATURES = { zone: 'battlefield', types: ['creature'] };
const YOUR_CREATURES = { types: ['creature'], controller: 'you' };
const UNTAP_YOURS = {
  kind: 'untap',
  objects: { kind: 'each', filter: { zone: 'battlefield', ...YOUR_CREATURES } },
};

describe('the real cards of the slice read as the engine runs them (D-187, D-188)', () => {
  test('Swashbuckler Extraordinaire: a Treasure as it enters, and the sacrifice of one or more Treasures at an attack', () => {
    const parsed = readAll(
      'When ~ enters, create a Treasure token.\nWhenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn.',
      'creature',
      ['Dragon', 'Rogue', 'Warrior'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'sacrifice',
                objects: {
                  kind: 'choose',
                  filter: { subtypes: ['Treasure'] },
                  anyNumber: true,
                  atLeastOne: true,
                },
              },
            },
            {
              kind: 'reflexive',
              targets: [
                { id: 't1', what: { kind: 'object', filter: CREATURES }, upToThatMany: true },
              ],
              effect: {
                kind: 'grantKeyword',
                objects: { kind: 'target', id: 't1' },
                keyword: { kind: 'doubleStrike' },
                duration: 'untilEndOfTurn',
              },
            },
          ],
        },
      },
    ]);
  });

  test('Moraug, Fury of Akoum: +1/+0 for each attack, and the added combat phase of a landfall in a main phase', () => {
    const parsed = readAll(
      "Each creature you control gets +1/+0 for each time it has attacked this turn.\nLandfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control.",
      'creature',
      ['Minotaur', 'Warrior'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: YOUR_CREATURES },
          power: { kind: 'timesAttacked' },
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        interveningIf: { kind: 'yourMainPhase' },
        effect: { kind: 'extraCombat', atBeginning: UNTAP_YOURS },
      },
    ]);
  });

  test("Expensive Taste: the top two cards of target opponent's library, face down, to look at and play", () => {
    const parsed = readAll(
      "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled.",
      'instant',
    );
    expect(parsed.spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 2, from: { kind: 'target', id: 't1' }, faceDown: true },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'whileExiled', lookAt: true },
        ],
      },
    });
  });
});

describe('"Whenever you attack" (CR 508.1, 603.2)', () => {
  test('is the batch trigger with one creature enough, and keeps the other attack triggers as they are', () => {
    expect(readAll('Whenever you attack, draw a card.', 'creature').abilities[0]).toMatchObject({
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
    });
    expect(
      readAll('Whenever you attack with two or more creatures, draw a card.', 'creature')
        .abilities[0],
    ).toMatchObject({ trigger: { kind: 'attackBatch', who: 'you', atLeast: 2 } });
  });

  test.each([
    'Whenever you attacked, draw a card.',
    'Whenever an opponent attacks, draw a card.',
    'Whenever you attack you, draw a card.',
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('"sacrifice one or more ..." and "up to that many target ..." (CR 701.21, 603.12)', () => {
  const body = (offer: string, reflexive: string) =>
    `Whenever you attack, you may ${offer}. When you do, ${reflexive}.`;

  test('any kind of permanent, and "other"', () => {
    const offered = (text: string): unknown => {
      const ability = readAll(text, 'creature').abilities[0];
      const effect = ability?.kind === 'triggered' ? ability.effect : undefined;
      const first = effect?.kind === 'sequence' ? effect.effects[0] : undefined;
      return first?.kind === 'may' && first.effect.kind === 'sacrifice'
        ? first.effect.objects
        : undefined;
    };
    expect(offered(body('sacrifice one or more Treasures', 'draw a card'))).toEqual({
      kind: 'choose',
      filter: { subtypes: ['Treasure'] },
      anyNumber: true,
      atLeastOne: true,
    });
    expect(offered(body('sacrifice one or more other creatures', 'draw a card'))).toEqual({
      kind: 'choose',
      filter: { types: ['creature'], other: true },
      anyNumber: true,
      atLeastOne: true,
    });
  });

  test.each([
    body('sacrifice one or more target Treasures', 'draw a card'),
    body('sacrifice one or more Treasures an opponent controls', 'draw a card'),
    body('sacrifice one or more', 'draw a card'),
    body('sacrifice one Treasure or more', 'draw a card'),
    body('sacrifice one or more cards', 'draw a card'),
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });

  test('"up to that many target creatures" gain several keywords; a slot of one creature is not "that many"', () => {
    const ability = readAll(
      body(
        'sacrifice one or more Treasures',
        'up to that many target creatures gain flying and trample until end of turn',
      ),
      'creature',
    ).abilities[0];
    expect(ability).toMatchObject({ kind: 'triggered' });
    expect(JSON.stringify(ability)).toContain('"upToThatMany":true');
    expect(JSON.stringify(ability)).toContain('"kind":"flying"');
    expect(JSON.stringify(ability)).toContain('"kind":"trample"');
    expect(
      dropped(
        body(
          'sacrifice one or more Treasures',
          'up to that many target creature gains flying until end of turn',
        ),
        'creature',
      ).reason,
    ).toBe('unrecognised');
  });

  test('without a sacrifice before it, the engine refuses "that many" (the number is what a sacrifice made)', () => {
    const card = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Many Targets',
        manaCost: '{1}{R}',
        typeLine: 'Creature — Goblin',
        oracleText:
          'Whenever you attack, up to that many target creatures gain flying until end of turn.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(card.support.status).toBe('unsupported');
    expect(validateCard(card.definition as CardDefinition).map((i) => i.message)).toContain(
      'only a slot of a reflexive ability after a sacrifice takes up to as many targets as were sacrificed',
    );
  });
});

describe('"for each time it has attacked this turn" (CR 508.1, 613.4c)', () => {
  test.each([
    ['+1/+0', 'timesAttacked', 0],
    ['+0/+1', 0, 'timesAttacked'],
  ])('%s', (step, power, toughness) => {
    const ability = readAll(
      `Each creature you control gets ${step} for each time it has attacked this turn.`,
      'creature',
    ).abilities[0];
    expect(ability).toMatchObject({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        power: power === 'timesAttacked' ? { kind: 'timesAttacked' } : power,
        toughness: toughness === 'timesAttacked' ? { kind: 'timesAttacked' } : toughness,
      },
    });
  });

  test.each([
    'Each creature you control gets +2/+0 for each time it has attacked this turn.',
    'Each creature you control gets +0/+0 for each time it has attacked this turn.',
    'Each creature you control gets +1/+0 for each time they have attacked this turn.',
    'Each creature you control gets +1/+0 for each time it has blocked this turn.',
    'Creatures you control get +1/+0 for each time they have attacked this turn.',
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('"if it\'s your main phase" and "there\'s an additional combat phase after this phase" (CR 505.1, 500.8)', () => {
  const landfall = (condition: string, body: string) =>
    `Landfall — Whenever a land you control enters, ${condition}${body}`;

  test('the condition goes with a landfall trigger; the combat phase and its untap are one effect', () => {
    expect(
      readAll(
        landfall(
          "if it's your main phase, ",
          "there's an additional combat phase after this phase.",
        ),
        'creature',
      ).abilities[0],
    ).toMatchObject({
      interveningIf: { kind: 'yourMainPhase' },
      effect: { kind: 'extraCombat' },
    });
  });

  test('the other order of words of the Dragons slice is still read, in an attack trigger', () => {
    expect(
      readAll(
        'Whenever ~ attacks, after this phase, there is an additional combat phase.',
        'creature',
      ).abilities[0],
    ).toMatchObject({ trigger: { kind: 'attacks' }, effect: { kind: 'extraCombat' } });
  });

  test.each([
    landfall(
      "if it's not your main phase, ",
      "there's an additional combat phase after this phase.",
    ),
    landfall(
      "if it's your first main phase, ",
      "there's an additional combat phase after this phase.",
    ),
    landfall("if it's your main phase, ", "there's an additional main phase after this phase."),
    landfall(
      "if it's your main phase, ",
      "there's an additional combat phase after this phase. At the beginning of that combat, tap all creatures you control.",
    ),
    landfall(
      "if it's your main phase, ",
      "there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control and draw a card.",
    ),
    'At the beginning of that combat, untap all creatures you control.',
  ])('%s stays unread', (text) => {
    // The lowering refuses what the grammar read but the engine cannot run as written: the whole ability is dropped, never half run.
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });
});

describe('"exile the top ... face down" and "look at and play" (CR 406.3, 406.3a, 601.2)', () => {
  test.each([
    ["Exile the top card of target opponent's library face down.", 1, 'opponent'],
    ["Exile the top three cards of target player's library face down.", 3, 'any'],
  ])('%s', (text, count, who) => {
    const spell = readAll(text, 'instant').spell;
    expect(spell?.targets).toEqual([{ id: 't1', what: { kind: 'player', filter: who } }]);
    expect(spell?.effect).toEqual({
      kind: 'exileTop',
      count,
      from: { kind: 'target', id: 't1' },
      faceDown: true,
    });
  });

  test.each([
    "Exile the top two cards of target opponent's library.",
    'Exile the top two cards of your library face down.',
    "Exile the top two cards of each opponent's library face down.",
    "Exile the top one cards of target opponent's library face down.",
    "Exile the top two cards of target opponent's library face down and draw a card.",
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'instant').reason).toBe('unrecognised');
  });

  test('the cards must have been exiled face down to be looked at', () => {
    const lone = read(
      'You may look at and play those cards for as long as they remain exiled.',
      'instant',
    );
    expect(lone.unparsed.length).toBeGreaterThan(0);
    // face up: nothing to look at
    const faceUp = read(
      'Exile the top two cards of your library. You may look at and play those cards for as long as they remain exiled.',
    );
    expect(faceUp.unparsed.length).toBeGreaterThan(0);
  });

  test.each([
    "Exile the top two cards of target opponent's library face down. You may play those cards for as long as they remain exiled.",
    "Exile the top two cards of target opponent's library face down. You may look at and play those cards this turn.",
    "Exile the top two cards of target opponent's library face down. You may look at those cards for as long as they remain exiled.",
  ])('%s stays unread', (text) => {
    expect(read(text, 'instant').unparsed.length).toBeGreaterThan(0);
  });
});
