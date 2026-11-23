/**
 * Static lowering of a group made Equipment (Gemcutter Buccaneer, issue 134): `Treasures you control are Equipment in addition to their other types and have "Equipped
 * creature gets +2/+0," equip Pirate {1}, and equip {3}.` Four kinds of static ability of the engine for the one statement: `setTypes` (the Equipment subtype in addition, layer 4,
 * CR 613.1d), `grantAbility` of a static "+N/+N" for the permanent the one that has it is attached to (given in layer 6 and applied in layer 7c, CR 613.1f, 613.4c) and a
 * `grantKeyword` of each equip ability (CR 702.6a, 702.6c).
 */
import type { Ability, StaticSubject } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type EquipmentKit = Extract<IrStaticEffect, { kind: 'equipmentKit' }>;

export function isEquipmentKitStatic(effect: IrStaticEffect): effect is EquipmentKit {
  return effect.kind === 'equipmentKit';
}

const failure = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/** The statement with its group already lowered (`subject`: a filter of permanents, never "other"). */
export function lowerEquipmentKitStatic(
  ability: Static,
  subject: StaticSubject,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isEquipmentKitStatic(effect) ||
    more.length > 0 ||
    subject.kind !== 'filter' ||
    subject.other === true ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures([
    'ability:static',
    'static:setTypes',
    'static:grantAbility',
    'static:grantKeyword',
    'static:modifyPt',
    'keyword:equip',
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  const out: Ability[] = [
    {
      kind: 'static',
      static: { kind: 'setTypes', subject, subtypes: ['Equipment'], additive: true },
    },
    {
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject,
        ability: {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'attached' },
            power: effect.power,
            toughness: effect.toughness,
          },
        },
      },
    },
  ];
  for (const equip of effect.equips) {
    const cost = lowerCost(equip.cost);
    if (!cost.ok) return cost;
    out.push({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject,
        keyword: {
          kind: 'equip',
          cost: [cost.value],
          ...(equip.subtype === undefined ? {} : { restriction: { subtypes: [equip.subtype] } }),
        },
      },
    });
  }
  return { ok: true, value: out, rule: ability.rule };
}
