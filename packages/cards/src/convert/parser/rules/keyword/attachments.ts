/**
 * The keyword lines of Auras and Equipment: "Enchant creature" (CR 702.5a) and "Equip {1}" (CR
 * 702.6a). Both carry their operand in the IR (the object an Aura can enchant, the cost of the
 * equip ability); the engine expands them (`rules/derive.ts`), so the lowering only builds the
 * keyword node.
 */
import { choice, fail, literal, map, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrCost, IrKeyword, IrNoun } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule, family, node } from '../registry';

/**
 * `keyword.enchant`: "Enchant creature", "Enchant creature you control", "Enchant land", "Enchant
 * permanent", "Enchant artifact or creature" (CR 702.5a: the object an Aura spell can target and
 * an Aura can stay attached to). The object is a permanent phrase (`noun.bare-permanent`) or a
 * basic land type (`noun.bare-land-type`: "Enchant Forest"); "Enchant player" and "Enchant creature
 * card in a graveyard" name something a permanent does not, and "Enchant creature with flying"
 * something it cannot say yet, so those stay unread.
 */
export const KEYWORD_ENCHANT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.enchant',
  family: 'keyword',
  leading: ['enchant'],
  cites: ['CR 702.5a (Enchant)', 'CR 303.4a (Enchantments)'],
  examples: [
    'Enchant creature',
    'Enchant creature you control',
    'Enchant land',
    'Enchant permanent',
    'Enchant artifact or creature',
    'Enchant creature or planeswalker you control',
    'enchant nonland permanent',
    'Enchant Forest',
    'Enchant Island',
  ],
  rejects: [
    'Enchant',
    'Enchant player',
    'Enchant Forest or Island',
    'Enchant forest',
    'Enchant Dragon',
    'Enchant creature card in a graveyard',
    'Enchant creature.',
    'Enchant creatures',
    'Enchant target creature',
    'Enchant creature, land',
    'Enchant creature and land',
    'Enchanted creature',
  ],
  parse: map(
    node<IrNoun, IrKeyword>(
      'keyword.enchant',
      map(
        sequence(
          literal('enchant '),
          family<IrNoun>('noun', { only: ['noun.bare-permanent', 'noun.bare-land-type'] }),
        ),
        ([, what]) => what,
      ),
      (what) => ({ kind: 'keyword', name: 'enchant', params: [what] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

/**
 * `keyword.equip`: "Equip {1}", "Equip—Pay 2 life" and, since stage P35 (D-176), "Equip—{2}, Pay 2 life." (CR 702.6a: "[Cost]: Attach this
 * permanent to target creature you control. Activate only as a sorcery."). The cost is a plain mana cost, a
 * payment of life or the two together, the two the engine pays for it. "Equip legendary creature {3}" and "Equip
 * commander {3}" restrict the creatures that can be chosen (CR 702.6c), which the engine's equip
 * does not model, so they stay unread, as do other costs and "Equip {X}".
 */
export const KEYWORD_EQUIP = defineRule<readonly IrKeyword[]>({
  id: 'keyword.equip',
  family: 'keyword',
  // "Equip—{2}, Pay 2 life." starts with its cost, whose words vary: tried at every keyword line (it fails at its first literal).
  leading: [],
  cites: ['CR 702.6a (Equip)', 'CR 702.6c (Equip)', 'CR 118.1 (Costs)'],
  examples: [
    'Equip {1}',
    'Equip {3}',
    'Equip {1}{W}',
    'Equip—Pay 2 life',
    'Equip—Pay 2 life.',
    'equip {2}',
    // Stage P35 (D-176): the two costs the engine pays for an equip ability, together.
    'Equip—{2}, Pay 2 life.',
    'Equip—{1}{W}, Pay 3 life',
  ],
  rejects: [
    'Equip',
    'Equip {X}',
    'Equip {W/U}',
    'Equip {2}.',
    'Equip legendary creature {3}',
    'Equip commander {3}',
    'Equip—Sacrifice a creature',
    'Equip—Pay 0 life',
    'Equip—Pay 2 life, {2}',
    'Equip—{2}, Pay 2 life, Pay 1 life',
    'Equip—{2}, Pay 0 life',
    'Equip—{2}, Sacrifice a creature',
    'Equip—{2}',
    'Equip—{2}, Pay 2 life..',
    'Equip {2}, Pay 2 life',
    'Equip—Pay 2 life..',
    'Equip {1}, equip {2}',
    'Equipped creature',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.equip',
      map(
        choice<readonly IrCost[]>(
          map(
            sequence(literal('equip '), family<IrCost>('cost', { only: ['cost.mana'] })),
            ([, cost]): readonly IrCost[] => [cost],
          ),
          // Stage P35 (D-176, CR 702.6a, 118.1): a mana cost and a payment of life, "Equip—{2}, Pay 2 life."
          quiet(
            map(
              sequence(
                literal('equip—'),
                family<IrCost>('cost', { only: ['cost.mana'] }),
                literal(', '),
                family<IrCost>('cost', { only: ['cost.pay-life'] }),
                optional(literal('.'), null),
              ),
              ([, mana, , life]): readonly IrCost[] => [mana, life],
            ),
          ),
          // The dash form ends with a period like Kicker's and Flashback's, whose real text has
          // one (Equip—{2}, Pay 2 life.). The `{M}` form has none.
          map(
            sequence(
              literal('equip—'),
              family<IrCost>('cost', { only: ['cost.pay-life'] }),
              optional(literal('.'), null),
            ),
            ([, cost]): readonly IrCost[] => [cost],
          ),
        ),
        (cost): readonly IrCost[] => cost,
      ),
      (cost) => ({ kind: 'keyword', name: 'equip', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

/**
 * `keyword.equip-quality`: "Equip Wizard {1}" (CR 702.6c, stage P67, D-220: the equip ability attaches only to a creature of that type; the permanent has
 * "Equip {3}" besides, for any creature). One creature type of the table and a plain mana cost. Not read: a type that is not one, two types, a supertype
 * ("Equip legendary creature {3}"), "commander", another cost, a type that is not capitalized.
 */
export const KEYWORD_EQUIP_QUALITY = defineRule<readonly IrKeyword[]>({
  id: 'keyword.equip-quality',
  family: 'keyword',
  leading: ['equip'],
  cites: ['CR 702.6c (Equip)', 'CR 205.3m (Subtypes)'],
  examples: ['Equip Wizard {1}', 'Equip Warrior {2}'],
  rejects: [
    'Equip Wizard',
    'Equip wizard {1}',
    'Equip Wizard {X}',
    'Equip Wizard {1}.',
    'Equip Wizard Warrior {1}',
    'Equip legendary creature {3}',
    'Equip commander {3}',
    'Equip Wizzard {1}',
    'Equip Wizard—Pay 2 life',
    'Equip {1}',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('equip '),
      pattern(/[A-Z][a-z]+(?= \{)/u),
      literal(' '),
      family<IrCost>('cost', { only: ['cost.mana'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, quality, , cost] = r.value;
    const word = quality[0];
    if (word === undefined || !CREATURE_TYPES.has(word)) return fail(ctx, pos);
    const keyword: IrKeyword = {
      kind: 'keyword',
      name: 'equip',
      params: [],
      cost: [cost],
      quality: word,
      span: { start: pos, end: r.pos },
      rule: 'keyword.equip-quality',
    };
    return { ok: true, value: [keyword], pos: r.pos };
  },
});

/**
 * `keyword.equip-commander`: "Equip commander {3}" (CR 702.6c, stage P70, D-259: the equip ability attaches only to a creature you control that is a
 * commander, CR 903.3; the permanent has "Equip {5}" besides, for any creature). A plain mana cost. Not read: another quality ("Equip legendary creature
 * {3}"), another cost, "Equip your commander {3}" and "Equip commander creature {3}" (other wordings).
 */
export const KEYWORD_EQUIP_COMMANDER = defineRule<readonly IrKeyword[]>({
  id: 'keyword.equip-commander',
  family: 'keyword',
  leading: ['equip'],
  cites: ['CR 702.6c (Equip)', 'CR 903.3 (Commander)'],
  examples: ['Equip commander {3}', 'equip commander {1}{W}'],
  rejects: [
    'Equip commander',
    'Equip commander {X}',
    'Equip commander {3}.',
    'Equip commander creature {3}',
    'Equip your commander {3}',
    'Equip commander—Pay 2 life',
    'Equip legendary creature {3}',
    'Equip Wizard {1}',
    'Equip {3}',
  ],
  parse: map(
    node<IrCost, IrKeyword>(
      'keyword.equip-commander',
      map(
        sequence(literal('equip commander '), family<IrCost>('cost', { only: ['cost.mana'] })),
        ([, cost]) => cost,
      ),
      (cost) => ({
        kind: 'keyword',
        name: 'equip',
        params: [],
        cost: [cost],
        commanderOnly: true,
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const ATTACHMENT_KEYWORD_RULES = [
  KEYWORD_ENCHANT,
  KEYWORD_EQUIP,
  KEYWORD_EQUIP_QUALITY,
  KEYWORD_EQUIP_COMMANDER,
];
