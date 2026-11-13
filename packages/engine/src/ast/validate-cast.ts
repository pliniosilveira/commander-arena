/**
 * Validation of what Kicker (CR 702.33), Flashback (CR 702.34) and the `kicked` condition add to
 * the AST: the shape of their costs, the cards that may have them, and the one use of a condition
 * the engine cannot run (a target that exists only when the spell was kicked, CR 702.33g).
 * `validate.ts` and `supported.ts` compose these.
 */
import { type CardType, isPermanentType } from '../characteristics';
import type { Ability, AlternativeCost, Cost, SpellText } from './types';
import { type AstIssue, checkCosts, issue } from './validate-parts';

/** CR 702.33a: the kicker cost is mana, life, or both; X is not a cost the engine can ask for. */
export function checkKickerCost(cost: readonly Cost[], path: string, out: AstIssue[]): void {
  checkCosts(cost, path, out);
  if (!Array.isArray(cost)) return;
  cost.forEach((c, i) => {
    if (c?.kind === 'mana') {
      if (c.symbols?.includes('X'))
        issue(out, `${path}[${i}]`, 'X in a kicker cost is not supported');
    } else if (c?.kind === 'payLife') {
      if (c.amount < 1) issue(out, `${path}[${i}].amount`, 'life paid must be at least 1');
    } else {
      issue(out, `${path}[${i}]`, 'a kicker cost may be mana or life only');
    }
  });
}

/** CR 702.34a: the flashback cost is a mana cost (other flashback costs are not supported). */
export function checkFlashbackCost(cost: readonly Cost[], path: string, out: AstIssue[]): void {
  checkCosts(cost, path, out);
  if (!Array.isArray(cost)) return;
  cost.forEach((c, i) => {
    if (c?.kind !== 'mana') {
      issue(out, `${path}[${i}]`, 'a flashback cost may be mana only');
    } else if (c.symbols?.includes('X')) {
      issue(out, `${path}[${i}]`, 'X in a flashback cost is not supported');
    }
  });
}

/** True when `node` (any JSON) holds a condition node of kind `kicked` anywhere inside. */
function mentionsKickedCondition(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsKickedCondition);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'kicked') return true;
  return Object.values(record).some(mentionsKickedCondition);
}

/** True when `node` (any JSON) holds a condition node of kind `replicated` anywhere inside. */
function mentionsReplicated(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsReplicated);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'replicated') return true;
  return Object.values(record).some(mentionsReplicated);
}

/** True when `node` (any JSON) holds a condition node of kind `escaped`, or "escapes with" counters. */
function mentionsEscaped(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsEscaped);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'escaped' || record.ifEscaped === true) return true;
  return Object.values(record).some(mentionsEscaped);
}

/** True when `node` (any JSON) holds a target slot that exists only if the spell was kicked, or only if it was not (D-181). */
function mentionsKickedTarget(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsKickedTarget);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.ifKicked === true || record.unlessKicked === true) return true;
  return Object.values(record).some(mentionsKickedTarget);
}

/** True when `node` (any JSON) holds a node of the kind (a condition, a selector, a keyword) anywhere inside. */
function mentionsKind(node: unknown, kind: string): boolean {
  if (Array.isArray(node)) return node.some((n) => mentionsKind(n, kind));
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === kind) return true;
  return Object.values(record).some((n) => mentionsKind(n, kind));
}

/** True when `node` (any JSON) holds a target slot that exists only if the gift was promised. */
function mentionsGiftTarget(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsGiftTarget);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.ifGiftPromised === true) return true;
  return Object.values(record).some(mentionsGiftTarget);
}

/** True when `node` (any JSON) holds an amount of kind `timesKicked` anywhere inside. */
function mentionsTimesKicked(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsTimesKicked);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'timesKicked') return true;
  return Object.values(record).some(mentionsTimesKicked);
}

/**
 * Face-level rules: Flashback is on an instant or a sorcery (CR 702.34a), and the `kicked`
 * condition needs a kicker ability for the card to have been kicked (CR 702.33d): without one it
 * would always be false, which is a card that does not do what its text says.
 */
export function checkCastFace(
  abilities: readonly Ability[],
  spell: SpellText | null,
  face: { readonly types: readonly CardType[] },
  path: string,
  out: AstIssue[],
  alternatives: readonly AlternativeCost[] = [],
): void {
  // D-121, CR 702.96a: overload changes the text of a spell, which an instant or a sorcery is (a permanent
  // spell's "target" sits in the abilities of the permanent, not in the text the spell had).
  const isSpell = face.types.includes('instant') || face.types.includes('sorcery');
  if (alternatives.some((a) => a?.kind === 'overload') && !isSpell) {
    issue(out, `${path}.alternativeCosts`, 'overload is on an instant or a sorcery (CR 702.96a)');
  }
  // CR 702.74a: the evoke trigger is the ability of a permanent; a spell that is not one has none.
  const permanent = face.types.some((t) => isPermanentType(t));
  if (alternatives.some((a) => a?.kind === 'evoke') && !permanent) {
    issue(out, `${path}.alternativeCosts`, 'evoke is on a permanent card (CR 702.74a)');
  }
  // CR 702.109a: dash gives haste and returns a creature, so it is on a creature card.
  if (alternatives.some((a) => a?.kind === 'dash') && !face.types.includes('creature')) {
    issue(out, `${path}.alternativeCosts`, 'dash is on a creature card (CR 702.109a)');
  }
  // CR 702.137a: spectacle is a way to cast a spell, so it is on a card that is not a land.
  if (alternatives.some((a) => a?.kind === 'spectacle') && face.types.includes('land')) {
    issue(out, `${path}.alternativeCosts`, 'spectacle is on a spell, not on a land (CR 702.137a)');
  }
  // CR 702.138a: escape casts a card from the graveyard, so it is on a card that is not a land, and it exiles
  // cards from the graveyard itself, which Delve would also do for the same cards (D-124 refuses the pair).
  if (alternatives.some((a) => a?.kind === 'escape')) {
    if (face.types.includes('land')) {
      issue(out, `${path}.alternativeCosts`, 'escape is on a spell, not on a land (CR 702.138a)');
    }
    if (abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'delve')) {
      issue(out, `${path}.alternativeCosts`, 'escape with delve is not supported (D-124)');
    }
  } else if (mentionsEscaped(abilities) || mentionsEscaped(spell)) {
    // CR 702.138b: without an escape cost nothing can have escaped; the condition would never hold.
    issue(out, path, 'the escaped condition and "escapes with" need an escape cost (CR 702.138b)');
  }
  // CR 118.9, 601.2h (D-149): "pay {W} and tap four untapped creatures" is a way to cast a spell, so it is on a card that is not a
  // land; the creatures Convoke, Improvise or Delve use are tapped or exiled for the same cost, which the engine does not combine.
  if (alternatives.some((a) => a?.kind === 'tapPermanents')) {
    if (face.types.includes('land')) {
      issue(out, `${path}.alternativeCosts`, 'tapPermanents is on a spell, not on a land');
    }
    if (
      abilities.some(
        (a) =>
          a.kind === 'keyword' &&
          (a.keyword.kind === 'convoke' ||
            a.keyword.kind === 'improvise' ||
            a.keyword.kind === 'delve'),
      )
    ) {
      issue(
        out,
        `${path}.alternativeCosts`,
        'tapPermanents with convoke, improvise or delve is not supported (D-149)',
      );
    }
  }
  // CR 702.35a, 702.94a, 702.143a (D-128, D-274): madness, miracle and foretell are ways to cast a card, so they are on a
  // card that is not a land (a land is played, never cast).
  for (const kind of ['madness', 'miracle', 'foretell'] as const) {
    if (alternatives.some((a) => a?.kind === kind) && face.types.includes('land')) {
      issue(out, `${path}.alternativeCosts`, `${kind} is on a spell, not on a land`);
    }
  }
  // CR 702.62a (D-128): suspend exiles the card to cast it later, so it is on a card that is not a land, and a face
  // has at most one.
  const suspends = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'suspend');
  if (suspends.length > 0 && face.types.includes('land')) {
    issue(out, `${path}.abilities`, 'suspend is on a spell, not on a land (CR 702.62a)');
  }
  if (suspends.length > 1) {
    issue(out, `${path}.abilities`, 'more than one suspend ability on a face is not supported');
  }
  // CR 702.84a (D-124): unearth returns "this card" to the battlefield, so it is on a permanent card; a face has
  // at most one (two instances are not supported).
  const unearths = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'unearth');
  if (unearths.length > 0 && !permanent) {
    issue(out, `${path}.abilities`, 'unearth is on a permanent card (CR 702.84a)');
  }
  if (unearths.length > 1) {
    issue(out, `${path}.abilities`, 'more than one unearth ability on a face is not supported');
  }
  // CR 702.141a (D-185): encore makes token copies of "this card" from the graveyard, so it is on a permanent card.
  if (abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'encore') && !permanent) {
    issue(out, `${path}.abilities`, 'encore is on a permanent card (CR 702.141a)');
  }
  // CR 702.129a (D-1162): eternalize makes a token copy of "this card" from the graveyard, so it is on a permanent card; a face has at most one (the engine reads one).
  const eternalizes = abilities.filter(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'eternalize',
  );
  if (eternalizes.length > 0 && !permanent) {
    issue(out, `${path}.abilities`, 'eternalize is on a permanent card (CR 702.129a)');
  }
  if (eternalizes.length > 1) {
    issue(out, `${path}.abilities`, 'more than one eternalize ability on a face is not supported');
  }
  // CR 702.82a (D-185): devour is applied as a permanent enters, and only a permanent card enters; one instance (CR 702.82c's variant is not supported).
  const devours = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'devour');
  if (devours.length > 0 && (!permanent || face.types.includes('land'))) {
    issue(
      out,
      `${path}.abilities`,
      'devour is on a permanent card that is not a land (CR 702.82a)',
    );
  }
  if (devours.length > 1) {
    issue(out, `${path}.abilities`, 'more than one devour ability on a face is not supported');
  }
  const has = (kind: 'kicker' | 'flashback' | 'multikicker') =>
    abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === kind);
  if (has('flashback') && !face.types.includes('instant') && !face.types.includes('sorcery')) {
    issue(out, `${path}.abilities`, 'flashback is on an instant or a sorcery (CR 702.34a)');
  }
  // D-129: "if a replicate cost was paid for it" needs a replicate ability to pay.
  const replicable = abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'replicate');
  if (!replicable && (mentionsReplicated(abilities) || mentionsReplicated(spell))) {
    issue(out, path, 'the replicated condition needs a replicate ability (CR 702.56a)');
  }
  // D-135, CR 702.174: "Gift a card" is on a card that is cast (a permanent or an instant or sorcery); the conditions and
  // selectors that read the gift need a gift to be promised.
  const gifts = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'gift');
  if (gifts.length > 1) {
    issue(out, `${path}.abilities`, 'more than one gift ability on a face is not supported');
  }
  if (gifts.length > 0 && face.types.includes('land')) {
    issue(out, `${path}.abilities`, 'gift is on a spell, not on a land (CR 702.174a)');
  }
  if (gifts.length > 0 && (spell?.modes !== undefined || spell?.chooseModes !== undefined)) {
    issue(out, `${path}.spell`, 'a modal spell with gift is not supported');
  }
  const mentionsGift = (n: unknown) =>
    mentionsKind(n, 'giftPromised') || mentionsKind(n, 'giftRecipient') || mentionsGiftTarget(n);
  if (gifts.length === 0 && (mentionsGift(abilities) || mentionsGift(spell))) {
    issue(
      out,
      path,
      'the gift conditions and "the chosen player" need a gift ability (CR 702.174a)',
    );
  }
  if (mentionsGiftTarget(abilities)) {
    issue(
      out,
      `${path}.abilities`,
      "a target that exists only if the gift was promised is a spell's (CR 702.174m)",
    );
  }
  // D-181, CR 702.33g: the slots that depend on the kicker are a spell's own, with one kicker cost (not Multikicker) and no modes.
  if (mentionsKickedTarget(abilities)) {
    issue(
      out,
      `${path}.abilities`,
      "a target chosen only if the spell was kicked (or only if it was not) is a spell's (CR 702.33g)",
    );
  }
  if (mentionsKickedTarget(spell)) {
    if (!has('kicker')) {
      issue(
        out,
        `${path}.spell`,
        has('multikicker')
          ? 'a target chosen only if the spell was kicked is run with Kicker, not Multikicker (CR 702.33c, 702.33g)'
          : 'a target chosen only if the spell was kicked needs a kicker ability (CR 702.33g)',
      );
    }
    if (spell?.modes !== undefined || spell?.chooseModes !== undefined) {
      issue(
        out,
        `${path}.spell`,
        'a target chosen only if the spell was kicked is not run in a modal spell',
      );
    }
  }
  const kickable = has('kicker') || has('multikicker');
  if (!kickable && (mentionsKickedCondition(abilities) || mentionsKickedCondition(spell))) {
    issue(out, path, 'the kicked condition needs a kicker ability (CR 702.33a, 702.33d)');
  }
  // D-110: "for each time it was kicked" counts what only a multikicker can pay more than once.
  if (!kickable && (mentionsTimesKicked(abilities) || mentionsTimesKicked(spell))) {
    issue(out, path, 'timesKicked needs a kicker or multikicker ability (CR 702.33c)');
  }
}

/**
 * The target slots of a spell that exist only if the gift was promised (`TargetSpec.ifGiftPromised`, CR 702.174m, D-135) and
 * that the effect also uses where the gift was not promised: a mention outside the `then` branch of a `giftPromised`
 * conditional. Chosen only when promised, such a slot would be empty otherwise, so every use of it is guarded.
 */
export function giftTargetsUsedUnguarded(spell: SpellText): string[] {
  const slots = (spell.targets ?? []).filter((t) => t.ifGiftPromised === true).map((t) => t.id);
  const unguarded = (node: unknown, id: string, guarded: boolean): boolean => {
    if (Array.isArray(node)) return node.some((n) => unguarded(n, id, guarded));
    if (node === null || typeof node !== 'object') return false;
    const record = node as Record<string, unknown>;
    if (record.kind === 'target' && record.id === id) return !guarded;
    if (record.kind === 'conditional') {
      const gift = mentionsKind(record.condition, 'giftPromised');
      return (
        unguarded(record.condition, id, guarded) ||
        unguarded(record.effect, id, guarded || gift) ||
        unguarded(record.else, id, guarded)
      );
    }
    return Object.values(record).some((n) => unguarded(n, id, guarded));
  };
  return slots.filter((id) => unguarded(spell.effect, id, false));
}

/**
 * Which case a `kicked` conditional's branch is: `{ kind: 'kicked' }` is true in its `then` and false in its `else`, `not` of it the other way
 * round. Any other condition (a conjunction, "if you control ...") says nothing certain about the kicker, so it is read as no case.
 */
function kickCase(condition: unknown, branch: 'then' | 'else'): 'kicked' | 'unkicked' | null {
  const c = condition as { kind?: string; term?: { kind?: string } } | null;
  if (c?.kind === 'kicked') return branch === 'then' ? 'kicked' : 'unkicked';
  if (c?.kind === 'not' && c.term?.kind === 'kicked') {
    return branch === 'then' ? 'unkicked' : 'kicked';
  }
  return null;
}

/**
 * The target slots that exist only if the spell was kicked (`ifKicked`) or only if it was not (`unlessKicked`, D-181, CR 702.33g, 601.2c) and that
 * the effect also uses where the other case is possible: a mention outside the branch of a `kicked` conditional that is that case. Chosen only
 * in one case, such a slot would be empty in the other, so every use of it is in the branch that happens only then.
 */
export function kickedTargetsUsedOutsideTheirCase(spell: SpellText): string[] {
  const slots = (spell.targets ?? []).filter((t) => t.ifKicked === true || t.unlessKicked === true);
  const outside = (
    node: unknown,
    id: string,
    wanted: 'kicked' | 'unkicked',
    now: 'kicked' | 'unkicked' | null,
  ): boolean => {
    if (Array.isArray(node)) return node.some((n) => outside(n, id, wanted, now));
    if (node === null || typeof node !== 'object') return false;
    const record = node as Record<string, unknown>;
    if (record.kind === 'target' && record.id === id) return now !== wanted;
    if (record.kind === 'conditional') {
      const then = kickCase(record.condition, 'then') ?? now;
      const otherwise = kickCase(record.condition, 'else') ?? now;
      return (
        outside(record.condition, id, wanted, now) ||
        outside(record.effect, id, wanted, then) ||
        outside(record.else, id, wanted, otherwise)
      );
    }
    return Object.values(record).some((n) => outside(n, id, wanted, now));
  };
  return slots
    .filter((t) => outside(spell.effect, t.id, t.ifKicked === true ? 'kicked' : 'unkicked', null))
    .map((t) => t.id);
}

/** One mention of a target id, with the kicked-conditional branches it sits in ("T3": then of #3). */
interface TargetMention {
  readonly id: string;
  readonly guards: readonly string[];
}

/** Collects every mention of a target id in an effect tree, with the kicked guards around it. */
function collectTargetRefs(
  node: unknown,
  guards: readonly string[],
  counter: { n: number },
  out: TargetMention[],
): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTargetRefs(n, guards, counter, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.kind === 'target' && typeof record.id === 'string') {
    out.push({ id: record.id, guards });
    return;
  }
  if (record.kind === 'conditional' && mentionsKickedCondition(record.condition)) {
    counter.n += 1;
    const n = counter.n;
    collectTargetRefs(record.effect, [...guards, `T${n}`], counter, out);
    collectTargetRefs(record.else, [...guards, `E${n}`], counter, out);
    return;
  }
  for (const value of Object.values(record)) collectTargetRefs(value, guards, counter, out);
}

/**
 * Whether the spell always needs this target slot: some mention is outside every kicked
 * conditional, or the mentions all sit under one kicked conditional and cover both its branches.
 * Anything else is a slot that only a kicked (or only an unkicked) spell would use.
 */
function alwaysNeeded(mentions: readonly TargetMention[]): boolean {
  if (mentions.length === 0 || mentions.some((m) => m.guards.length === 0)) return true;
  const nodes = new Set((mentions[0]?.guards ?? []).map((g) => g.slice(1)));
  for (const node of nodes) {
    const then = mentions.some((m) => m.guards.includes(`T${node}`));
    const otherwise = mentions.some((m) => m.guards.includes(`E${node}`));
    const allUnder = mentions.every(
      (m) => m.guards.includes(`T${node}`) || m.guards.includes(`E${node}`),
    );
    if (then && otherwise && allUnder) return true;
  }
  return false;
}

/**
 * The target slots of a spell that only a kicked (or only an unkicked) spell would use and that are not declared so. CR 702.33g
 * and 601.2c say such targets are chosen only in that case; the engine asks for every declared
 * target of a spell that is not marked `ifKicked` or `unlessKicked` (D-181), so it would demand a target the card does not need.
 */
export function kickerOnlyTargets(spell: SpellText): string[] {
  // A modal spell keeps its targets and effects in the modes (D-114): each is read like a spell of its own.
  if (spell.modes !== undefined) {
    return spell.modes.flatMap((mode) =>
      kickerOnlyTargets({
        effect: mode.effect,
        ...(mode.targets ? { targets: mode.targets } : {}),
      }),
    );
  }
  const mentions: TargetMention[] = [];
  collectTargetRefs(spell.effect, [], { n: 0 }, mentions);
  // A slot declared `ifKicked` or `unlessKicked` (D-181) is the engine's way to say so: `kickedTargetsUsedOutsideTheirCase` checks its uses.
  return (spell.targets ?? [])
    .filter((t) => t.ifKicked !== true && t.unlessKicked !== true)
    .map((t) => t.id)
    .filter((id) => {
      const ofId = mentions.filter((m) => m.id === id);
      return ofId.length > 0 && !alwaysNeeded(ofId);
    });
}
