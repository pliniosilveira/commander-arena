/**
 * One ability line, text to engine AST (D-063): segment, read the slots with the phrase rules,
 * bind, lower. Every stage that can refuse says why in the same shape, so a line that does not
 * become an ability always leaves a `LineFailure` with a reason (D-064): the text was not
 * recognised, it was recognised but the engine cannot run it, or a pronoun had nothing to mean.
 */
import type { Ability } from '@commander-arena/engine';
import type { UnparsedReason } from '../../types';
import { type BindScope, bind } from './ir/bind';
import type { RuleFamily } from './ir/types';
import type { FeatureRef } from './lower/features';
import { type FaceCosts, lower, newContext, type SpellParts } from './lower/index';
import { parseAbility } from './parse-ability';
import type { RuleSet } from './rules/registry';
import { type FaceKind, segment } from './segment';

export interface LineFailure {
  readonly reason: UnparsedReason;
  /** The text from the point where reading stopped (the whole text when nothing was read). */
  readonly stoppedAt: string;
  readonly closestRule: string;
  readonly slot?: RuleFamily;
  readonly recognised: readonly string[];
  readonly needs?: readonly FeatureRef[];
  readonly reference?: string;
}

export type LineResult =
  | {
      readonly ok: true;
      readonly kind: 'abilities';
      readonly abilities: readonly Ability[];
      /** The lowering that built them (`keyword.line`, `mana.tap-add`, a replacement rule). */
      readonly ruleId: string;
      readonly recognised: readonly string[];
    }
  | {
      readonly ok: true;
      readonly kind: 'spell';
      readonly parts: SpellParts;
      readonly ruleId: string;
      readonly recognised: readonly string[];
    }
  | {
      /** What the line says about the cost of casting its card (stage P13). */
      readonly ok: true;
      readonly kind: 'faceCosts';
      readonly costs: FaceCosts;
      readonly ruleId: string;
      readonly recognised: readonly string[];
    }
  | { readonly ok: false; readonly failure: LineFailure };

export interface CompileOptions {
  readonly rules: RuleSet;
  /** 'spell' reads text that no other reading claims as the effect of an instant or sorcery. */
  readonly face: FaceKind;
  readonly faceTypes?: readonly string[];
  /** The face's subtypes: an Aura or Equipment is what an "enchanted" or "equipped" subject needs. */
  readonly faceSubtypes?: readonly string[];
  /** Target numbering shared by the spell lines of one face. */
  readonly scope?: BindScope;
  /** The face's name: a modal spell's mode text shows it where the Oracle text says `~` (stage P19). */
  readonly name?: string;
  /** The text of the face puts its own name inside a quotation (stage P36, D-178): `~` there may be the card, not the permanent that has the quoted ability. */
  readonly namedInQuotes?: boolean;
}

function from(text: string, at: number): string {
  return text.slice(at).trimStart();
}

/** Reads, binds and lowers one normalized ability line. */
export function compileLine(text: string, options: CompileOptions): LineResult {
  const parsed = parseAbility(segment(text, options.face), options.rules);
  if (!parsed.ok) {
    const f = parsed.failure;
    return {
      ok: false,
      failure: {
        reason: 'unrecognised',
        stoppedAt: f.progress === 0 ? text : from(text, f.progress),
        closestRule: f.closestRule,
        ...(f.slot === null ? {} : { slot: f.slot }),
        recognised: f.recognised,
      },
    };
  }
  const scope = options.scope ?? { targetCount: 0 };
  const before = scope.targetCount;
  const { recognised } = parsed;
  const abilities: Ability[] = [];
  let spell: { parts: SpellParts; rule: string } | null = null;
  let faceCosts: { costs: FaceCosts; rule: string } | null = null;
  let ruleId = '';
  for (const ir of parsed.abilities) {
    const isSpell = ir.kind === 'spell' || ir.kind === 'modal';
    const bound = bind(ir, isSpell ? { scope } : {});
    if (!bound.ok) {
      scope.targetCount = before;
      return {
        ok: false,
        failure: {
          reason: 'unboundReference',
          stoppedAt: from(text, bound.at.start),
          closestRule: bound.rule,
          recognised,
          reference: bound.reference,
        },
      };
    }
    const ctx = newContext(
      isSpell ? 'spell' : 'ability',
      options.faceTypes ?? [],
      options.faceSubtypes ?? [],
      options.name ?? '',
    );
    ctx.namedInQuotes = options.namedInQuotes === true;
    const lowered = lower(bound.ability, ctx);
    if (!lowered.ok) {
      scope.targetCount = before;
      return {
        ok: false,
        failure: {
          reason: 'notRunnable',
          stoppedAt: from(text, lowered.at.start),
          closestRule: lowered.rule,
          recognised,
          ...(lowered.needs.length > 0 ? { needs: lowered.needs } : {}),
        },
      };
    }
    ruleId = ruleId === '' ? lowered.rule : ruleId;
    if (lowered.value.kind === 'abilities') abilities.push(...lowered.value.abilities);
    else if (lowered.value.kind === 'spell') {
      spell = { parts: lowered.value.parts, rule: lowered.rule };
    } else faceCosts = { costs: lowered.value.costs, rule: lowered.rule };
  }
  if (faceCosts !== null) {
    return {
      ok: true,
      kind: 'faceCosts',
      costs: faceCosts.costs,
      ruleId: faceCosts.rule,
      recognised,
    };
  }
  if (spell !== null) {
    return { ok: true, kind: 'spell', parts: spell.parts, ruleId: spell.rule, recognised };
  }
  return { ok: true, kind: 'abilities', abilities, ruleId, recognised };
}
