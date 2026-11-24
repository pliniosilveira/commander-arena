// The party (CR 700.8): the Oracle text of Archpriest of Iona, Malakir Blood-Priest, Squad Commander, Thwart the Grave and Burakos, Party Leader read by the grammar, the nodes the
// lowering produces, and the engine running what was lowered. The lines are the Oracle text of those cards; the near misses are SYNTHETIC.
import { syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const PARTY = { kind: 'partySize' } as const;

describe('"the number of creatures in your party"', () => {
  test('a characteristic-defining power (Archpriest of Iona)', () => {
    const face = readAll(
      'Archpriest of Iona’s power is equal to the number of creatures in your party.'.replace(
        'Archpriest of Iona’s',
        '~’s',
      ),
      'creature',
      ['Human', 'Cleric'],
    );
    expect(face.abilities).toEqual([
      { kind: 'static', static: { kind: 'characteristicPt', power: PARTY } },
    ]);
  });

  test('the intervening "if you have a full party" is amountIs of the party, at least 4', () => {
    const face = readAll(
      'At the beginning of combat on your turn, if you have a full party, target creature gets +1/+1 and gains flying until end of turn.',
      'creature',
      ['Human', 'Cleric'],
    );
    expect(face.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      interveningIf: { kind: 'amountIs', amount: PARTY, compare: { cmp: 'atLeast', value: 4 } },
    });
  });

  test('each opponent loses X and you gain X (Malakir Blood-Priest)', () => {
    const face = readAll(
      'When ~ enters, each opponent loses X life and you gain X life, where X is the number of creatures in your party.',
      'creature',
      ['Vampire', 'Cleric'],
    );
    expect(JSON.stringify(face.abilities)).toContain('"amount":{"kind":"partySize"}');
  });

  test('defending player loses X and you create X Treasures (Burakos)', () => {
    const face = readAll(
      'Whenever ~ attacks, defending player loses X life and you create X Treasure tokens, where X is the number of creatures in your party.',
      'creature',
      ['Orc'],
    );
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'defendingPlayer' }, amount: PARTY },
            { kind: 'createToken', count: PARTY },
          ],
        },
      },
    ]);
  });

  test('is not read: another party, another count or a partial party', () => {
    for (const text of [
      'When ~ enters, each opponent loses X life, where X is the number of creatures in their party.',
      "When ~ enters, each opponent loses X life, where X is the number of creatures in target player's party.",
      'When ~ enters, each opponent loses X life, where X is the number of Clerics in your party.',
      'At the beginning of combat on your turn, if you have a party, you gain 3 life.',
      "At the beginning of combat on your turn, if you don't have a full party, you gain 3 life.",
    ]) {
      expect(dropped(text, 'creature').reason, text).toBeDefined();
    }
  });
});

describe('a count of the party (Squad Commander, Thwart the Grave)', () => {
  test('a token for each creature in your party', () => {
    const face = readAll(
      'When ~ enters, create a 1/1 white Kor Warrior creature token for each creature in your party.',
      'creature',
      ['Kor', 'Warrior'],
    );
    expect(face.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'createToken', count: PARTY },
    });
  });

  test('a spell that costs {1} less for each creature in your party', () => {
    const face = readAll('~ costs {1} less to cast for each creature in your party.', 'sorcery');
    expect(face.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: PARTY },
      },
    ]);
  });

  test('"costs {2} less for each creature in your party" is not read (a larger step)', () => {
    expect(
      dropped('~ costs {2} less to cast for each creature in your party.', 'sorcery').reason,
    ).toBeDefined();
  });
});

describe('two targets of one graveyard (Thwart the Grave)', () => {
  const TEXT =
    'Return target creature card and up to one target Cleric, Rogue, Warrior, or Wizard creature card from your graveyard to the battlefield.';

  test('two targets, the second optional, both in your graveyard', () => {
    const face = readAll(TEXT, 'sorcery');
    expect(face.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
      },
      {
        id: 't2',
        what: {
          kind: 'object',
          filter: {
            zone: 'graveyard',
            types: ['creature'],
            controller: 'you',
            anyOf: [
              { subtypes: ['Cleric'] },
              { subtypes: ['Rogue'] },
              { subtypes: ['Warrior'] },
              { subtypes: ['Wizard'] },
            ],
          },
        },
        min: 0,
        max: 1,
      },
    ]);
  });

  test('is not read from an opponent graveyard, to the hand, or with no zone at all', () => {
    for (const text of [
      "Return target creature card and target land card from an opponent's graveyard to the battlefield.",
      'Return target creature card and target land card to the battlefield.',
      'Return target creature card and up to one target land card from your graveyard to your hand.',
    ]) {
      expect(dropped(text, 'sorcery').reason, text).toBeDefined();
    }
  });

  test('the engine returns both cards, and just the first when the second is left out', () => {
    const base = syntheticCard('SYNTHETIC Party Rite');
    const [baseFace] = base.faces;
    if (baseFace === undefined) throw new Error('no face');
    const spell = readAll(TEXT, 'sorcery').spell;
    if (spell === null || spell === undefined) throw new Error('no spell');
    const lowered = {
      ...base,
      name: 'SYNTHETIC Lowered Grave Thwart',
      faces: [{ ...baseFace, name: 'SYNTHETIC Lowered Grave Thwart', abilities: [], spell }],
    };
    expect(validateCard(lowered)).toEqual([]);
    const build = () =>
      scenario()
        .seat(0)
        .define(lowered)
        .hand('SYNTHETIC Lowered Grave Thwart')
        .battlefield('Swamp', { count: 6 })
        .graveyard('Grizzly Bears', { label: 'bears' })
        .graveyard('SYNTHETIC Party Cleric', { label: 'cleric' })
        .seat(1)
        .library('Island', { count: 4 })
        .at('precombatMain', { active: 0 })
        .build();
    const both = build();
    both.act(0).cast('SYNTHETIC Lowered Grave Thwart', { targets: ['bears', 'cleric'], pay: true });
    both.passAll();
    both.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    both.expect.zone('SYNTHETIC Party Cleric', 'battlefield', { seat: 0 });
    const one = build();
    one.act(0).cast('SYNTHETIC Lowered Grave Thwart', { targets: ['bears'], pay: true });
    one.passAll();
    one.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    one.expect.zone('SYNTHETIC Party Cleric', 'graveyard', { seat: 0 });
  });
});

describe('"~ is also a Cleric, Rogue, Warrior, and Wizard" (Burakos)', () => {
  test('lowers to the creature types added to the permanent itself', () => {
    const face = readAll('~ is also a Cleric, Rogue, Warrior, and Wizard.', 'creature', ['Orc']);
    expect(face.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: { kind: 'this' },
          additive: true,
          subtypes: ['Cleric', 'Rogue', 'Warrior', 'Wizard'],
        },
      },
    ]);
  });

  test('the engine counts it as one member of the party, and it adds the four types', () => {
    const lowered = readAll('~ is also a Cleric, Rogue, Warrior, and Wizard.', 'creature', [
      'Orc',
    ]).abilities;
    const base = syntheticCard('SYNTHETIC Party Chimera');
    const [baseFace] = base.faces;
    if (baseFace === undefined) throw new Error('no face');
    const card = {
      ...base,
      name: 'SYNTHETIC Lowered Chimera',
      faces: [{ ...baseFace, name: 'SYNTHETIC Lowered Chimera', abilities: lowered }],
    };
    expect(validateCard(card)).toEqual([]);
    const g = scenario()
      .seat(0)
      .define(card)
      .battlefield('SYNTHETIC Lowered Chimera')
      .battlefield('SYNTHETIC Party Scribe')
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('SYNTHETIC Lowered Chimera', {
      subtypes: ['Orc', 'Cleric', 'Rogue', 'Warrior', 'Wizard'],
    });
    g.expect.pt('SYNTHETIC Party Scribe', 2, 2);
  });
});
