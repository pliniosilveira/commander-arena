/**
 * Where the reference `granter` may be written (CR 113.6, 613.1f; Grothama, All-Devouring: "Other creatures have \"Whenever this creature attacks, you may have it fight
 * Grothama, All-Devouring.\""): only inside the ability a static `grantAbility` gives, where the engine knows the permanent that gives it (`rules/granter.ts`), and never with the
 * `object` the engine fills in. Anywhere else nothing would say which permanent it is, so the card is refused instead of running an ability that names nothing.
 */
import type { CardFace } from '../cards/definition';
import { type AstIssue, issue } from './validate-parts';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function walk(node: unknown, path: string, granted: boolean, out: AstIssue[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      walk(child, `${path}[${i}]`, granted, out);
    });
    return;
  }
  if (!isRecord(node)) return;
  if (node.kind === 'granter') {
    if (!granted) {
      issue(out, path, "'granter' is only valid in the ability a static grantAbility gives");
    }
    if (node.object !== undefined) {
      issue(out, `${path}.object`, 'the engine names the permanent that grants; a card does not');
    }
    return;
  }
  // The static form of `grantAbility` has a `subject` (the effect of a resolving spell has `objects` and no permanent that keeps giving it).
  const gives = node.kind === 'grantAbility' && 'subject' in node;
  for (const [key, child] of Object.entries(node)) {
    walk(child, `${path}.${key}`, granted || (gives && key === 'ability'), out);
  }
}

/** The issues of the `granter` references of a face. */
export function checkGranterRefs(face: CardFace, path: string, out: AstIssue[]): void {
  walk(face.abilities, `${path}.abilities`, false, out);
  walk(face.spell, `${path}.spell`, false, out);
}
