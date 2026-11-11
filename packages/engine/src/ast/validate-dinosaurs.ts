/**
 * Checks of the Dinosaurs slice (D-145): the shapes of the statics, keywords, effects and costs that slice adds, and what they need of
 * the card they are printed on. `validate.ts` and `validate-parts.ts` call into this file for the kinds they do not know themselves.
 */
import type { CardFace } from '../cards/definition';
import { COLORS, isPermanentType } from '../characteristics';
import type { StaticEffect } from './types';
import { checkStaticSubject } from './validate-attach';
import { isOneOf, kindOf } from './validate-base';
import { type AstIssue, checkCondition, issue } from './validate-parts';

/** The static effects D-145 adds. True when `s` is one of them (it was checked here). */
export function checkDinosaursStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  switch (s?.kind) {
    case 'restrictionUnless':
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (kindOf(s.subject) !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'restrictionUnless is the ability of the permanent itself ("this")',
        );
      }
      if (!Array.isArray(s.restrictions) || s.restrictions.length === 0) {
        issue(
          out,
          `${path}.restrictions`,
          'restrictionUnless names what the permanent can not do: cantAttack, cantBlock',
        );
      } else {
        s.restrictions.forEach((r, i) => {
          if (!isOneOf(r, ['cantAttack', 'cantBlock'])) {
            issue(
              out,
              `${path}.restrictions[${i}]`,
              `restrictionUnless covers cantAttack and cantBlock, not ${String(r)}`,
            );
          }
        });
        if (new Set(s.restrictions).size !== s.restrictions.length) {
          issue(out, `${path}.restrictions`, 'a restriction is named once');
        }
      }
      if (s.unless === undefined || s.unless === null) {
        issue(out, `${path}.unless`, 'restrictionUnless needs the condition that lifts it');
      } else {
        checkCondition(s.unless, `${path}.unless`, out);
      }
      return true;
    case 'setColors':
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (!Array.isArray(s.colors)) {
        issue(out, `${path}.colors`, 'colors must be a list (empty for colorless)');
      } else {
        s.colors.forEach((c, i) => {
          if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${String(c)}`);
        });
        if (new Set(s.colors).size !== s.colors.length)
          issue(out, `${path}.colors`, 'duplicate color');
      }
      return true;
    case 'loseAllAbilities': {
      // The subject is what an Aura or Equipment is attached to: no filter (CR 613.8) and no host type to read.
      if (kindOf(s.subject) !== 'attached') {
        issue(
          out,
          `${path}.subject`,
          'a static loseAllAbilities is about the permanent this Aura or Equipment is attached to',
        );
      } else if (
        (s.subject as { types?: unknown }).types !== undefined ||
        (s.subject as { supertypes?: unknown }).supertypes !== undefined
      ) {
        issue(
          out,
          `${path}.subject`,
          'loseAllAbilities names no host type: the enchant ability already limits what it is attached to',
        );
      }
      return true;
    }
    default:
      return false;
  }
}

/** Whether the value, at any depth, is an object reference of this kind (`{ kind: <kind> }`). */
function mentionsRef(node: unknown, kind: string): boolean {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((n) => mentionsRef(n, kind));
  const record = node as Record<string, unknown>;
  if (record.kind === kind) return true;
  return Object.values(record).some((v) => mentionsRef(v, kind));
}

/** What the keywords and abilities of this slice need of the face they are printed on (D-145). */
export function checkDinosaursFace(face: CardFace, path: string, out: AstIssue[]): void {
  // CR 607.2a (D-145): "the exiled card" is the card the permanent exiled with a linked ability: Hideaway's, or an `exile` with `linked`.
  const readsLinked = face.abilities.some((a) => mentionsRef(a, 'linkedExile'));
  const exilesLinked = face.abilities.some(
    (a) =>
      (a?.kind === 'keyword' && a.keyword?.kind === 'hideaway') ||
      ((a?.kind === 'triggered' || a?.kind === 'activated') &&
        (JSON.stringify(a.effect ?? null).includes('"linked":true') ||
          // D-230: a token that copies a creature and remembers the cards the effect before it exiled holds the link itself.
          JSON.stringify(a.effect ?? null).includes('"linkExiled":true'))),
  );
  if (readsLinked && !exilesLinked) {
    issue(
      out,
      `${path}.abilities`,
      'linkedExile reads the cards this permanent exiled with a linked ability: the face needs Hideaway or an exile that says linked',
    );
  }
  checkDividedDamage(face, path, out);
  face.abilities.forEach((a, i) => {
    if (a?.kind === 'keyword' && a.keyword?.kind === 'hideaway') {
      // CR 702.75a: Hideaway is a triggered ability of a permanent entering the battlefield.
      if (!face.types.some((t) => isPermanentType(t))) {
        issue(out, `${path}.abilities[${i}]`, 'hideaway belongs to a permanent card (CR 702.75a)');
      }
    }
  });
  face.abilities.forEach((a, i) => {
    if (a?.kind !== 'keyword' || a.keyword?.kind !== 'escalate') return;
    // CR 702.120a: escalate is a static ability of modal spells: a face whose spell text offers more than one mode.
    const choose = face.spell?.chooseModes;
    const most = Math.max(choose?.max ?? 0, choose?.maxIf?.max ?? 0);
    if (face.spell?.modes === undefined || most < 2) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        'escalate belongs to a modal spell that lets more than one mode be chosen (CR 702.120a)',
      );
    }
  });
}

/** Every node of this kind (`{ kind: <kind> }`) anywhere in the value, in order. */
function nodesOfKind(
  node: unknown,
  kind: string,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) nodesOfKind(n, kind, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  if (record.kind === kind) out.push(record);
  for (const v of Object.values(record)) nodesOfKind(v, kind, out);
  return out;
}

/**
 * CR 601.2d (D-145): a slot with `divide` and the `dealDividedDamage` that deals its damage go together, in the spell's own text: the
 * damage divided as the spell is cast, to the targets of that slot.
 */
function checkDividedDamage(face: CardFace, path: string, out: AstIssue[]): void {
  const spell = face.spell;
  const divided = (spell?.targets ?? []).filter((t) => t?.divide !== undefined).map((t) => t.id);
  const effects = nodesOfKind(spell?.effect ?? null, 'dealDividedDamage');
  const named = effects.map((e) => (e.to as { id?: string } | undefined)?.id);
  const elsewhere =
    nodesOfKind(face.abilities, 'dealDividedDamage').length +
    nodesOfKind(spell?.modes ?? null, 'dealDividedDamage').length;
  if (elsewhere > 0) {
    issue(
      out,
      path,
      'dealDividedDamage belongs to the effect of a spell (not an ability, not a mode): the division is announced as it is cast',
    );
  }
  for (const id of named) {
    if (typeof id === 'string' && !divided.includes(id)) {
      issue(
        out,
        `${path}.spell.effect`,
        `dealDividedDamage names the target "${id}", whose slot has no divide`,
      );
    }
  }
  for (const id of divided) {
    if (!named.includes(id)) {
      issue(
        out,
        `${path}.spell.targets`,
        `the slot "${id}" divides something but no dealDividedDamage deals it`,
      );
    }
  }
}
