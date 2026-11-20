// The damage bonus of the Tannuk deck (issue 347): "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it
// deals that much damage plus 2 instead." (Torbran, Thane of Red Fell) and the "red or artifact ... plus 1" of Mechanized Warfare, read by the grammar
// (`replacement.damage-bonus`), lowered to the engine's `damageBonus` and played through applyAction. The cards are SYNTHETIC: the text is the real
// Oracle text of the two cards (packages/cards/test/fixtures/corpus/golden.jsonl), the names, mana costs and the creature's power and toughness are not.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';

const SENTENCE =
  'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.';
const WARFARE =
  'If a red or artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead.';

const damageBonus = (sources: unknown, amount: number) => ({
  kind: 'replacement',
  replacement: { kind: 'damageBonus', sources, amount },
});

describe('the grammar reads the two cards', () => {
  test('a red source, plus 2 (a creature face)', () => {
    expect(readAll(SENTENCE, 'creature').abilities).toEqual([
      damageBonus({ colors: ['R'], controller: 'you' }, 2),
    ]);
  });

  test('a red or artifact source, plus 1 (an enchantment face)', () => {
    expect(readAll(WARFARE, 'enchantment').abilities).toEqual([
      damageBonus({ anyOf: [{ colors: ['R'] }, { types: ['artifact'] }], controller: 'you' }, 1),
    ]);
  });

  test('a number word, a single card type', () => {
    expect(
      readAll(
        'If an artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus three instead.',
        'enchantment',
      ).abilities,
    ).toEqual([damageBonus({ types: ['artifact'], controller: 'you' }, 3)]);
  });

  test.each([
    ['a source of any player', SENTENCE.replace('a red source you control', 'a red source')],
    [
      'a creature as the only recipient',
      SENTENCE.replace('an opponent or a permanent', 'a creature'),
    ],
    ['twice the damage', SENTENCE.replace('plus 2', 'times two')],
    ['a variable amount', SENTENCE.replace('plus 2', 'plus X')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'enchantment')).toBeDefined();
  });
});

describe('the engine plays what the grammar read', () => {
  const sovereign: CardDefinition = parsed(
    'SYNTHETIC Parsed Red Sovereign',
    'Creature — Dwarf',
    SENTENCE,
    { manaCost: '{1}{R}{R}{R}', colors: ['R'], power: '2', toughness: '4' },
  );
  const warfare: CardDefinition = parsed('SYNTHETIC Parsed Forge Banner', 'Enchantment', WARFARE, {
    manaCost: '{1}{R}{R}',
    colors: ['R'],
  });

  test('both are valid', () => {
    expect(validateCard(sovereign)).toEqual([]);
    expect(validateCard(warfare)).toEqual([]);
  });

  test('both together on a Lightning Bolt: 3 + 2 + 1', () => {
    const g = scenario()
      .seat(0)
      .define(sovereign)
      .define(warfare)
      .battlefield(sovereign.name, warfare.name, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 34);
  });

  test('the red-or-artifact effect alone: +1, and nothing for a green source', () => {
    const g = scenario()
      .seat(0)
      .define(warfare)
      .battlefield(warfare.name, 'Mountain', 'Forest')
      .hand(BOLT, 'SYNTHETIC Green Zap')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 36);
    g.act(0).cast('SYNTHETIC Green Zap', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 34);
  });
});
