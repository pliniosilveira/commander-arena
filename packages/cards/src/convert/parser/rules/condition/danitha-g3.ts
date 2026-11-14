/**
 * Conditions of group 3 of the Danitha deck (issue 26, D-427): what the permanent an Aura enchants is ("enchanted creature is green", Shield of the Oversoul),
 * whether another Aura is on it ("another Aura is attached to enchanted creature", Face of Divinity) and whether the Aura itself just came ("~ entered this turn", Shardmage's
 * Rescue). They are read after "as long as" of a static ability (CR 611.3a), where the engine reads them through layers 1, 4 and 5 and the turn log and nothing of layer 7
 * (CR 613.8), and, like every condition, after the "if" of an intervening "if".
 */
import { choice, fail, map, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

const COLORS = 'white|blue|black|red|green';

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/** "enchanted" or "equipped": the word that says which kind of attachment the permanent is the host of (CR 303.4b, 301.5a). */
const VIA = new Map<string, 'enchanted' | 'equipped'>([
  ['enchanted', 'enchanted'],
  ['equipped', 'equipped'],
]);

/**
 * `condition.host-is-color`: "enchanted creature is green", "equipped creature is white" (CR 303.4b, 301.5a, 105.2: the permanent an Aura or an Equipment is attached to has the
 * color). The engine's `objectMatches` of the permanent the source is attached to, read as the permanent is after layers 1, 4 and 5 (CR 613.1d, 613.1e): a color-changing
 * effect counts, and a creature of two colors is both. One color word. Not read: "enchanted creature is a Zombie", "is red or white", "isn't green", "is colorless",
 * "enchanted land is green", "enchanted creature is green and white".
 */
export const CONDITION_HOST_IS_COLOR = defineRule<IrCondition>({
  id: 'condition.host-is-color',
  family: 'condition',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 303.4b (Auras)',
    'CR 301.5a (Equipment)',
    'CR 105.2 (Colors)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: [
    'enchanted creature is green',
    'enchanted creature is white',
    'equipped creature is red',
    'Enchanted creature is blue',
  ],
  rejects: [
    'enchanted creature is green.',
    'enchanted creature is a Zombie',
    'enchanted creature is red or white',
    'enchanted creature is green and white',
    "enchanted creature isn't green",
    'enchanted creature is colorless',
    'enchanted creature is purple',
    'enchanted land is green',
    'enchanted creature is',
    'target creature is green',
    'enchanted creatures are green',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(enchanted|equipped) creature is (${COLORS})${BOUNDARY}(?! (?:or|and) (?:${COLORS})${BOUNDARY})`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const via = VIA.get((r.value.value[1] ?? '').toLowerCase());
    const color = (r.value.value[2] ?? '').toLowerCase();
    if (via === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: condition('condition.host-is-color', pos, r.pos, {
        kind: 'attachedTo',
        filter: { types: ['creature'], colors: [color], raw: `${via} creature is ${color}` },
        via,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.other-attached-to-host`: "another Aura is attached to enchanted creature", "another Equipment is attached to equipped creature" (CR 303.4, 301.5, 701.3: an Aura
 * or an Equipment is attached to the permanent it enchants or equips). At least one other permanent of the kind is attached to the permanent the source is attached to, counted
 * as the engine's `amountIs` of a `countOf` with `other` and `attachedTo` the host (the source itself is left out). Auras and Equipment of any controller count. Not read: "an
 * Aura", "another Aura or Equipment", "two or more other Auras", "another permanent", "is attached to ~", "isn't attached", "another Aura is attached to equipped creature"
 * (an Aura's word is "enchanted").
 */
export const CONDITION_OTHER_ATTACHED_TO_HOST = defineRule<IrCondition>({
  id: 'condition.other-attached-to-host',
  family: 'condition',
  leading: ['another'],
  cites: [
    'CR 303.4 (Auras)',
    'CR 301.5 (Equipment)',
    'CR 701.3 (Attach)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: [
    'another Aura is attached to enchanted creature',
    'another Equipment is attached to equipped creature',
  ],
  rejects: [
    'another Aura is attached to enchanted creature.',
    'an Aura is attached to enchanted creature',
    'another Aura is attached to equipped creature',
    'another Equipment is attached to enchanted creature',
    'another Aura or Equipment is attached to enchanted creature',
    'another Aura is attached to enchanted land',
    'another Aura is attached to ~',
    "another Aura isn't attached to enchanted creature",
    'another Auras are attached to enchanted creature',
    'another permanent is attached to enchanted creature',
    'another Aura is attached to it',
    'two other Auras are attached to enchanted creature',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `another (Aura|Equipment) is attached to (enchanted|equipped) creature${BOUNDARY}`,
          'u',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const subtype = r.value.value[1] ?? '';
    const via = VIA.get(r.value.value[2] ?? '');
    // An Aura enchants and an Equipment equips (CR 303.4a, 301.5a): the words of the kind and of the host agree.
    if (via === undefined || (subtype === 'Aura') !== (via === 'enchanted')) return fail(ctx, pos);
    return {
      ok: true,
      value: condition('condition.other-attached-to-host', pos, r.pos, {
        kind: 'otherAttachedToHost',
        attachment: { subtypes: [subtype], raw: subtype },
        via,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-entered-this-turn`: "~ entered this turn", "~ entered the battlefield this turn" (CR 400.7: an object that changes zones is a new object, so the permanent
 * is the one that entered during this turn; CR 611.3a). The permanent the ability is on ("this Aura" is `~`). The engine's `thisEnteredThisTurn`, read from the turn log. Not
 * read: another permanent ("a creature entered this turn", which is the condition of the Celebration cards), "~ didn't enter this turn", "~ entered last turn", "it entered this
 * turn" (what "it" is has no antecedent here).
 */
export const CONDITION_THIS_ENTERED_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.this-entered-this-turn',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 400.7 (Objects)', 'CR 611.3a (Continuous Effects)'],
  examples: ['~ entered this turn', '~ entered the battlefield this turn'],
  rejects: [
    '~ entered this turn.',
    "~ didn't enter this turn",
    '~ entered last turn',
    '~ entered',
    'it entered this turn',
    'a creature entered this turn',
    '~ entered the battlefield',
    '~ entered this turn under your control',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      choice(
        map(pattern(new RegExp(`~ entered the battlefield this turn${BOUNDARY}`, 'iu')), () => 1),
        map(pattern(new RegExp(`~ entered this turn${BOUNDARY}`, 'iu')), () => 2),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.this-entered-this-turn', pos, r.pos, {
        kind: 'thisEnteredThisTurn',
      }),
      pos: r.pos,
    };
  },
});

export const DANITHA_G3_CONDITION_RULES = [
  CONDITION_HOST_IS_COLOR,
  CONDITION_OTHER_ATTACHED_TO_HOST,
  CONDITION_THIS_ENTERED_THIS_TURN,
];
