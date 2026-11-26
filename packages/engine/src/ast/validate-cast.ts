/**
 * Validation of what Kicker (CR 702.33), Flashback (CR 702.34) and the `kicked` condition add to
 * the AST: the shape of their costs, the cards that may have them, and the one use of a condition
 * the engine cannot run (a target that exists only when the spell was kicked, CR 702.33g).
 * `validate.ts` and `supported.ts` compose these.
 */
import { type CardType, isPermanentType } from '../characteristics';
import type { Ability, AlternativeCost, Cost, SpellText } from './types';
import { type AstIssue, checkCosts, issue } from './validate-parts';

/**
 * CR 702.33a: the kicker cost is mana, life, or both; X is not a cost the engine can ask for. A plain kicker (not Multikicker) may also sacrifice one permanent
 * ("Kicker—Sacrifice a creature.", CR 118.8, 701.21a): a filter of the caster's permanents, paid after the mana as an additional cost's sacrifice is.
 */
export function checkKickerCost(
  cost: readonly Cost[],
  path: string,
  out: AstIssue[],
  /**
   * "Kicker {X}. X can't be 0." (CR 702.33a, 107.3a): only the kicker keyword (`kicker: true`) may have an {X} in its cost, and then its `xNotZero` says so (an X announced as 0 is not
   * built); a multikicker never has one.
   */
  kicker?: { readonly xNotZero: unknown },
): void {
  checkCosts(cost, path, out);
  if (!Array.isArray(cost)) return;
  const hasX = cost.some((c) => c?.kind === 'mana' && c.symbols?.includes('X'));
  if (kicker?.xNotZero !== undefined && (kicker.xNotZero !== true || !hasX)) {
    issue(out, path, 'xNotZero is true, for a kicker cost with an {X}');
  }
  cost.forEach((c, i) => {
    if (c?.kind === 'mana') {
      if (c.symbols?.includes('X') && kicker?.xNotZero !== true)
        issue(out, `${path}[${i}]`, 'X in a kicker cost is not supported');
    } else if (c?.kind === 'payLife') {
      if (c.amount < 1) issue(out, `${path}[${i}].amount`, 'life paid must be at least 1');
    } else if (c?.kind === 'sacrifice' && kicker !== undefined) {
      if (
        'kind' in c.what ||
        c.count !== undefined ||
        c.countX === true ||
        c.anyNumber === true ||
        c.atLeastOne === true ||
        c.alongside !== undefined
      ) {
        issue(out, `${path}[${i}]`, 'a kicker sacrifice names one permanent by a filter');
      }
      if (cost.filter((o) => o?.kind === 'sacrifice').length > 1) {
        issue(out, `${path}[${i}]`, 'a kicker cost has one sacrifice');
      }
    } else {
      issue(
        out,
        `${path}[${i}]`,
        kicker === undefined
          ? 'a kicker cost may be mana or life only'
          : 'a kicker cost may be mana, life or a sacrifice only',
      );
    }
  });
}

/**
 * CR 702.34a: the flashback cost is a mana cost, or a mana cost and a payment of life ("Flashback—{1}{U}, Pay 3 life.",
 * Deep Analysis); a flashback cost with another cost is not supported.
 */
export function checkFlashbackCost(cost: readonly Cost[], path: string, out: AstIssue[]): void {
  checkCosts(cost, path, out);
  if (!Array.isArray(cost)) return;
  cost.forEach((c, i) => {
    if (c?.kind === 'payLife') {
      if (!Number.isSafeInteger(c.amount) || c.amount < 1) {
        issue(out, `${path}[${i}].amount`, 'life paid must be at least 1');
      }
    } else if (c?.kind === 'sacrifice') {
      // CR 118.9, 601.2h: "Flashback—Sacrifice three creatures": a filter of the caster's permanents and how many (one cost, paid as an additional cost's sacrifice is).
      if (
        'kind' in c.what ||
        c.countX === true ||
        c.anyNumber === true ||
        c.atLeastOne === true ||
        c.alongside !== undefined ||
        (c.count !== undefined && (!Number.isSafeInteger(c.count) || c.count < 2))
      ) {
        issue(
          out,
          `${path}[${i}]`,
          'a flashback sacrifice names permanents by a filter and a count',
        );
      }
      if (cost.filter((o) => o?.kind === 'sacrifice').length > 1) {
        issue(out, `${path}[${i}]`, 'a flashback cost has one sacrifice');
      }
    } else if (c?.kind === 'exileFromGraveyard') {
      // CR 702.34a, 107.3a, 118.9: "Flashback—{3}{U}{R}, Exile X cards from your graveyard": the X announced as the spell is cast, one such cost, of cards of any kind.
      if (
        c.countX !== true ||
        c.count !== 1 ||
        Object.keys(c.filter).length > 0 ||
        cost.filter((o) => o?.kind === 'exileFromGraveyard').length > 1
      ) {
        issue(out, `${path}[${i}]`, 'a flashback exile of graveyard cards is X cards of any kind');
      }
    } else if (c?.kind !== 'mana') {
      issue(
        out,
        `${path}[${i}]`,
        'a flashback cost may be mana, life, a sacrifice or an exile of X graveyard cards only',
      );
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

/** True when `node` (any JSON) holds a condition node of kind `castForAlternative`. */
function mentionsCastForAlternative(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsCastForAlternative);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'castForAlternative') return true;
  return Object.values(record).some(mentionsCastForAlternative);
}

/** True when `node` (any JSON) holds a condition node of kind `foretold`. */
function mentionsForetold(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsForetold);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'foretold') return true;
  return Object.values(record).some(mentionsForetold);
}

/** True when `node` (any JSON) holds a target slot that exists only if the spell was cast during its controller's main phase (issue 244). */
function mentionsCastPhaseTarget(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsCastPhaseTarget);
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.ifCastInOwnMain === true) return true;
  return Object.values(record).some(mentionsCastPhaseTarget);
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
  if (record.ifGiftPromised !== undefined) return true;
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
  face: {
    readonly types: readonly CardType[];
    readonly additionalCosts?: readonly Cost[];
    readonly additionalCostChoice?: readonly (readonly Cost[])[];
  },
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
  // CR 702.176a: impending is on a creature permanent card (the permanent is not a creature while it has a time counter).
  if (alternatives.some((a) => a?.kind === 'impending') && !face.types.includes('creature')) {
    issue(out, `${path}.alternativeCosts`, 'impending is on a creature card (CR 702.176a)');
  }
  // CR 702.152a: blitz gives haste and sacrifices a creature, so it is on a creature card.
  if (alternatives.some((a) => a?.kind === 'blitz') && !face.types.includes('creature')) {
    issue(out, `${path}.alternativeCosts`, 'blitz is on a creature card (CR 702.152a)');
  }
  // CR 702.103a: bestow is on a creature card (the spell is an Aura spell with "enchant creature" when cast for it).
  if (alternatives.some((a) => a?.kind === 'bestow') && !face.types.includes('creature')) {
    issue(out, `${path}.alternativeCosts`, 'bestow is on a creature card (CR 702.103a)');
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
  // CR 118.9: without the alternative cost no spell can have been cast for it; the condition would never hold.
  if (
    !alternatives.some((a) => a?.kind === 'payMana') &&
    (mentionsCastForAlternative(abilities) || mentionsCastForAlternative(spell))
  ) {
    issue(
      out,
      path,
      'the castForAlternative condition needs a payMana alternative cost (CR 118.9)',
    );
  }
  // CR 702.143a: without a foretell cost no spell can have been foretold; the condition would never hold.
  if (
    !alternatives.some((a) => a?.kind === 'foretell') &&
    (mentionsForetold(abilities) || mentionsForetold(spell))
  ) {
    issue(out, path, 'the foretold condition needs a foretell cost (CR 702.143a)');
  }
  // CR 702.180a: harmonize casts the card from the graveyard and exiles it as it leaves the stack, so it is on an instant or a sorcery (a permanent
  // spell would be exiled instead of entering); the engine does not combine it with the other ways of paying part of the cost.
  if (alternatives.some((a) => a?.kind === 'harmonize')) {
    if (!face.types.includes('instant') && !face.types.includes('sorcery')) {
      issue(
        out,
        `${path}.alternativeCosts`,
        'harmonize is on an instant or a sorcery (CR 702.180a)',
      );
    }
    const combined = abilities.some(
      (a) =>
        a.kind === 'keyword' &&
        (a.keyword.kind === 'convoke' ||
          a.keyword.kind === 'improvise' ||
          a.keyword.kind === 'delve' ||
          a.keyword.kind === 'flashback'),
    );
    if (combined || alternatives.some((a) => a?.kind === 'escape')) {
      issue(
        out,
        `${path}.alternativeCosts`,
        'harmonize with convoke, improvise, delve, flashback or escape is not supported',
      );
    }
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
  // CR 118.9 (Snuff Out): paying life rather than the mana cost is a way to cast a spell, so it is on a card that is not a land; Convoke, Improvise and Delve are not combined with it.
  if (alternatives.some((a) => a?.kind === 'payLife')) {
    if (face.types.includes('land')) {
      issue(out, `${path}.alternativeCosts`, 'payLife is on a spell, not on a land');
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
        'payLife with convoke, improvise or delve is not supported',
      );
    }
  }
  // Issue 159: casting from the graveyard by sacrificing creatures is a way to cast a spell, so it is on a card that is not a land; Convoke, Improvise and Delve are not combined with it.
  if (
    alternatives.some(
      (a) => a?.kind === 'sacrificeFromGraveyard' || a?.kind === 'sacrificePermanents',
    )
  ) {
    if (face.types.includes('land')) {
      issue(
        out,
        `${path}.alternativeCosts`,
        'sacrificeFromGraveyard and sacrificePermanents are on a spell, not on a land',
      );
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
        'sacrificeFromGraveyard and sacrificePermanents with convoke, improvise or delve are not supported',
      );
    }
  }
  // CR 702.35a, 702.94a, 702.143a (D-128, D-274): madness, miracle and foretell are ways to cast a card, so they are on a
  // card that is not a land (a land is played, never cast).
  for (const kind of ['madness', 'miracle', 'foretell', 'morph'] as const) {
    if (alternatives.some((a) => a?.kind === kind) && face.types.includes('land')) {
      issue(out, `${path}.alternativeCosts`, `${kind} is on a spell, not on a land`);
    }
  }
  // CR 702.37a, 701.40b: a card cast face down is a creature (a 2/2), and a face-down permanent is turned face up as a creature card: morph is on a creature card.
  if (alternatives.some((a) => a?.kind === 'morph') && !face.types.includes('creature')) {
    issue(out, `${path}.alternativeCosts`, 'morph is on a creature card (CR 702.37a)');
  }
  // CR 702.37b: megamorph is a variant of morph, so the flag is only on a morph cost.
  for (const a of alternatives) {
    if (a !== undefined && 'megamorph' in a && a.megamorph === true && a.kind !== 'morph') {
      issue(out, `${path}.alternativeCosts`, 'megamorph is only on a morph cost (CR 702.37b)');
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
  // CR 702.129a (D-384): eternalize makes a token copy of "this card" from the graveyard, so it is on a permanent card; a face has at most one (the engine reads one).
  const eternalizes = abilities.filter(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'eternalize',
  );
  if (eternalizes.length > 0 && !permanent) {
    issue(out, `${path}.abilities`, 'eternalize is on a permanent card (CR 702.129a)');
  }
  if (eternalizes.length > 1) {
    issue(out, `${path}.abilities`, 'more than one eternalize ability on a face is not supported');
  }
  // CR 702.128a: embalm makes a token copy of "this card" from the graveyard, so it is on a permanent card; a face has at most one.
  const embalms = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'embalm');
  if (embalms.length > 0 && !permanent) {
    issue(out, `${path}.abilities`, 'embalm is on a permanent card (CR 702.128a)');
  }
  if (embalms.length > 1) {
    issue(out, `${path}.abilities`, 'more than one embalm ability on a face is not supported');
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
  const has = (
    kind: 'kicker' | 'flashback' | 'multikicker' | 'buyback' | 'retrace' | 'rebound' | 'cipher',
  ) => abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === kind);
  if (has('flashback') && !face.types.includes('instant') && !face.types.includes('sorcery')) {
    issue(out, `${path}.abilities`, 'flashback is on an instant or a sorcery (CR 702.34a)');
  }
  // The cast pays one sacrifice: a flashback cost that sacrifices cannot go with an additional cost that does (CR 118.9d).
  const flashbackAbility = abilities.find(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'flashback',
  );
  if (
    flashbackAbility?.kind === 'keyword' &&
    flashbackAbility.keyword.kind === 'flashback' &&
    flashbackAbility.keyword.cost.some((c) => c.kind === 'sacrifice') &&
    (face.additionalCosts ?? []).some((c) => c.kind === 'sacrifice')
  ) {
    issue(
      out,
      `${path}.abilities`,
      'a flashback sacrifice with an additional sacrifice is not supported',
    );
  }
  // The cast pays one sacrifice: a kicker sacrifice cannot go with another sacrifice of the same cast (additional cost, either way of a cost choice, or a flashback cost).
  const kickerAbility = abilities.find((a) => a.kind === 'keyword' && a.keyword.kind === 'kicker');
  const sacrifices = (costs: readonly Cost[] | undefined): boolean =>
    (costs ?? []).some((c) => c?.kind === 'sacrifice');
  if (
    kickerAbility?.kind === 'keyword' &&
    kickerAbility.keyword.kind === 'kicker' &&
    sacrifices(kickerAbility.keyword.cost) &&
    (sacrifices(face.additionalCosts) ||
      alternatives.some(
        (a) => a.kind === 'sacrificeFromGraveyard' || a.kind === 'sacrificePermanents',
      ) ||
      (face.additionalCostChoice ?? []).some((way) => sacrifices(way)) ||
      (flashbackAbility?.kind === 'keyword' &&
        flashbackAbility.keyword.kind === 'flashback' &&
        sacrifices(flashbackAbility.keyword.cost)))
  ) {
    issue(
      out,
      `${path}.abilities`,
      'a kicker sacrifice with another sacrifice in the cost of the spell is not supported',
    );
  }
  // D-667 (CR 702.81a): "You may cast this card from your graveyard by discarding a land card": a land is played, never cast, so it has no retrace.
  if (has('retrace') && face.types.includes('land')) {
    issue(out, `${path}.abilities`, 'retrace is on a card that is cast, not a land (CR 702.81a)');
  }
  // Galadriel group 3, CR 702.27a: "put this spell into its owner's hand as it resolves" is said of an instant or a sorcery.
  if (has('buyback') && !face.types.includes('instant') && !face.types.includes('sorcery')) {
    issue(out, `${path}.abilities`, 'buyback is on an instant or a sorcery (CR 702.27a)');
  }
  // CR 702.88a: "Rebound appears on some instants and sorceries".
  if (has('rebound') && !face.types.includes('instant') && !face.types.includes('sorcery')) {
    issue(out, `${path}.abilities`, 'rebound is on an instant or a sorcery (CR 702.88a)');
  }
  // CR 702.99: "Cipher appears on some instants and sorceries".
  if (has('cipher') && !face.types.includes('instant') && !face.types.includes('sorcery')) {
    issue(out, `${path}.abilities`, 'cipher is on an instant or a sorcery (CR 702.99)');
  }
  // D-129: "if a replicate cost was paid for it" needs a replicate ability to pay.
  const replicable = abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'replicate');
  if (!replicable && (mentionsReplicated(abilities) || mentionsReplicated(spell))) {
    issue(out, path, 'the replicated condition needs a replicate ability (CR 702.56a)');
  }
  // CR 702.56a (Psionic Ritual): a replicate cost that taps permanents is paid with the cost of tapping permanents the cast already has (a `tapPermanents` alternative cost, convoke, improvise
  // or delve), which the engine does not combine.
  const tapsReplicate = abilities.some(
    (a) =>
      a.kind === 'keyword' &&
      a.keyword.kind === 'replicate' &&
      Array.isArray(a.keyword.cost) &&
      a.keyword.cost.some((c) => c?.kind === 'tapPermanents'),
  );
  if (
    tapsReplicate &&
    (alternatives.some((a) => a?.kind === 'tapPermanents') ||
      abilities.some(
        (a) =>
          a.kind === 'keyword' &&
          (a.keyword.kind === 'convoke' ||
            a.keyword.kind === 'improvise' ||
            a.keyword.kind === 'delve'),
      ))
  ) {
    issue(
      out,
      `${path}.abilities`,
      'a replicate cost that taps permanents with a tapPermanents alternative cost, convoke, improvise or delve is not supported',
    );
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
  if (mentionsCastPhaseTarget(abilities)) {
    issue(
      out,
      `${path}.abilities`,
      "a target chosen only if the spell was cast during its controller's main phase is a spell's",
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
 * The target slots of a spell that exist only in one branch of a gift conditional (`TargetSpec.ifGiftPromised`, D-135) and
 * that the effect also uses in the other branch. Such a slot would be empty there, so every use must match its condition.
 */
export function giftTargetsUsedUnguarded(spell: SpellText): string[] {
  const slots = (spell.targets ?? []).filter((t) => t.ifGiftPromised !== undefined);
  const unguarded = (
    node: unknown,
    id: string,
    expected: boolean,
    promised: boolean | null,
  ): boolean => {
    if (Array.isArray(node)) return node.some((n) => unguarded(n, id, expected, promised));
    if (node === null || typeof node !== 'object') return false;
    const record = node as Record<string, unknown>;
    if (record.kind === 'target' && record.id === id) return promised !== expected;
    if (record.kind === 'conditional') {
      const gift = mentionsKind(record.condition, 'giftPromised');
      return (
        unguarded(record.condition, id, expected, promised) ||
        unguarded(record.effect, id, expected, gift ? true : promised) ||
        unguarded(record.else, id, expected, gift ? false : promised)
      );
    }
    return Object.values(record).some((n) => unguarded(n, id, expected, promised));
  };
  return slots
    .filter((slot) => unguarded(spell.effect, slot.id, slot.ifGiftPromised === true, null))
    .map((slot) => slot.id);
}

/**
 * The target slots of a spell that exist only if it was cast during its controller's main phase (`TargetSpec.ifCastInOwnMain`, issue 244) and that the effect uses
 * anywhere but the `effect` of a `castInOwnMainPhase` conditional: elsewhere the slot would be empty. Also true of a slot in a modal spell, which this does not run.
 */
export function castPhaseTargetsUsedUnguarded(spell: SpellText): string[] {
  const slots = (spell.targets ?? []).filter((t) => t.ifCastInOwnMain === true);
  const unguarded = (node: unknown, id: string, guarded: boolean): boolean => {
    if (Array.isArray(node)) return node.some((n) => unguarded(n, id, guarded));
    if (node === null || typeof node !== 'object') return false;
    const record = node as Record<string, unknown>;
    if (record.kind === 'target' && record.id === id) return !guarded;
    if (record.kind === 'conditional') {
      const phase = (record.condition as { kind?: unknown } | null)?.kind === 'castInOwnMainPhase';
      return (
        unguarded(record.condition, id, guarded) ||
        unguarded(record.effect, id, guarded || phase) ||
        unguarded(record.else, id, guarded)
      );
    }
    return Object.values(record).some((n) => unguarded(n, id, guarded));
  };
  const modal = spell.modes !== undefined || spell.chooseModes !== undefined;
  return slots
    .filter((slot) => modal || unguarded(spell.effect, slot.id, false))
    .map((slot) => slot.id);
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
