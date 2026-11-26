// Desert Bloom group 6a: "choose an opponent. That player returns a card from their graveyard to their hand" (Skullwinder), "create that many ... tokens" after cards were
// returned to the battlefield (Vengeful Regrowth, CR 608.2c) and "for each mana from a Desert spent to cast this spell" (Cataclysmic Prospecting, CR 601.2h, 205.3i). The engine runs
// what is lowered in packages/engine/test/scenario-xx-desert-bloom-g6a.test.ts. The synthetic lines say what the real ones say with other numbers and nouns.
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const effectOf = (def: ReturnType<typeof parsed>) => {
  const spell = def.faces[0]?.spell;
  if (spell === null || spell === undefined) throw new Error('not a spell');
  return spell.effect;
};

describe('that player returns a card (Skullwinder)', () => {
  const TEXT =
    'When ~ enters, return target card from your graveyard to your hand, then choose an opponent. That player returns a card from their graveyard to their hand.';

  test('reads as a choice of an opponent and a return as that player', () => {
    const def = parsed('Skullwinder', 'Creature — Snake', TEXT, { power: '1', toughness: '3' });
    const ability = def.faces[0]?.abilities[0];
    expect(ability?.kind === 'triggered' && ability.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', to: 'hand' },
        { kind: 'choosePlayer', among: 'opponent' },
        {
          kind: 'forEachPlayer',
          players: { kind: 'chosenPlayer' },
          runsAs: 'each',
          effect: { kind: 'moveToZone', to: 'hand', objects: { kind: 'choose', count: 1 } },
        },
      ],
    });
  });

  test('with no choice of a player before it, "that player" is nobody the engine can name: refused', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'Lonely Snake',
        typeLine: 'Creature — Snake',
        oracleText:
          'When ~ enters, return target card from your graveyard to your hand. That player returns a card from their graveyard to their hand.'.replaceAll(
            '~',
            'Lonely Snake',
          ),
        power: '1',
        toughness: '3',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test('"up to one" and a kind of card are other wordings and stay unsupported', () => {
    for (const line of [
      'That player returns up to one card from their graveyard to their hand.',
      'That player returns a creature card from their graveyard to their hand.',
    ]) {
      const imported = parseOnly(
        spellCard('Odd Return', `Choose an opponent. ${line}`, { type: 'Instant' }),
      );
      expect(imported.support.status, line).toBe('unsupported');
    }
  });
});

describe('"that many" after cards were returned (Vengeful Regrowth)', () => {
  test('the tokens are as many as the cards the return moved', () => {
    const def = parsed(
      'Regrowth',
      'Sorcery',
      'Return up to three target land cards from your graveyard to the battlefield tapped. Create that many 4/2 green Plant Warrior creature tokens with reach.',
    );
    expect(effectOf(def)).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', to: 'battlefield', tapped: true },
        { kind: 'createToken', count: { kind: 'movedCount' } },
      ],
    });
  });

  test('after an instruction that moved nothing, "that many" is not read (a damage trigger keeps its meaning)', () => {
    const def = parsed(
      'Bleeder',
      'Creature — Plant',
      'Whenever ~ is dealt damage, create that many 1/1 green Plant creature tokens.',
      { power: '1', toughness: '1' },
    );
    const ability = def.faces[0]?.abilities[0];
    expect(ability?.kind === 'triggered' && ability.effect).toMatchObject({
      kind: 'createToken',
      count: { kind: 'triggerDamage' },
    });
  });
});

describe('mana from a land type spent to cast a spell (Cataclysmic Prospecting)', () => {
  test('a count of the mana a Desert made, one tapped Treasure for each', () => {
    const def = parsed(
      'Prospecting',
      'Sorcery',
      '~ deals X damage to each creature. For each mana from a Desert spent to cast this spell, create a tapped Treasure token.',
      { manaCost: '{X}{R}{R}' },
    );
    expect(effectOf(def)).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage' },
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          tapped: true,
          count: { kind: 'manaSpent', fromType: 'Desert' },
        },
      ],
    });
  });

  test('a source that is not named by a land type is not read', () => {
    const imported = parseOnly(
      spellCard(
        'Odd Spend',
        'Odd Spend deals X damage to each creature. For each mana from a Treasure spent to cast this spell, create a tapped Treasure token.',
        { type: 'Instant', manaCost: '{X}{R}' },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});
