/**
 * What one card can do to the agent, read from the engine's parsed abilities (issue 653, step 2b): the traits
 * the opponent profile (`heuristic-profile.ts`) counts over a decklist and the threat scenarios
 * (`heuristic-threats.ts`) sort an opponent's cards by. Nothing here reads the rules text: a card is what its
 * `CardDefinition` says, so text the engine does not understand gives it no trait (SPEC 7.1: dropped, never
 * guessed), and a card's name is never read.
 *
 * A card is read as a player reads it before it is cast: its first face, and the other face of a card that can
 * be cast either way (split, Adventure, modal double-faced). Its parts are read in three groups: the SPELL (what
 * it does as it resolves), what it does as it ENTERS ("When this enters": a creature's removal or counter rides
 * on it), and its OTHER abilities (triggered and activated). The definition of a token it creates is not read:
 * that is the token's. The traits:
 *  - haste: a creature with haste of its own (the keyword, or an ability that gives it to "this");
 *  - hasteGiver: anything that gives haste to other creatures (a static, a spell, an Equipment);
 *  - flash: a creature with flash (it can block, or attack, before the agent sees it coming);
 *  - evasive: a creature with flying, trample, menace, double strike or another keyword that gets it past blockers;
 *  - counter: the spell or its entering counters a spell or an ability;
 *  - removal: the spell or its entering takes away one creature or planeswalker of the agent's: destroys,
 *    exiles, bounces, deals damage to, shrinks or fights one target, or makes an opponent sacrifice;
 *  - wipe: the same to every creature of a filter that is not only the caster's own;
 *  - trick: an instant-speed noncreature spell that helps the caster's creature (a pump, a keyword, a shield)
 *    and does none of the above;
 *  - fog: the spell prevents all combat damage (or all damage), not only to one target;
 *  - reach: anything of it deals damage to, or drains, an opponent (burn, drain: a way to win past blockers);
 *  - extraCombat: an additional combat (or beginning phase);
 *  - winsOutright: it wins the game or takes an extra turn (what a combo deck plays for).
 *
 * Traits are a pure function of the definition, so they are kept for each definition object (`traitsOf`).
 */
import type { CardDefinition, CardFace, TargetSpec } from '@commander-arena/engine';
import { manaValue } from '@commander-arena/engine';

export interface CardTraits {
  readonly land: boolean;
  readonly creature: boolean;
  /** The mana value of its first face's mana cost (0 without one). */
  readonly manaValue: number;
  /** The printed power of its first face (0 for none, or a power that is defined by an ability). */
  readonly power: number;
  /** Castable at instant speed: an instant, or a card with flash. */
  readonly instantSpeed: boolean;
  /** A creature that is hard to block or hits twice: flying, trample, menace, double strike and the like. */
  readonly evasive: boolean;
  readonly haste: boolean;
  readonly hasteGiver: boolean;
  readonly flash: boolean;
  readonly counter: boolean;
  readonly removal: boolean;
  readonly wipe: boolean;
  readonly trick: boolean;
  readonly fog: boolean;
  readonly reach: boolean;
  readonly extraCombat: boolean;
  readonly winsOutright: boolean;
}

type Node = Readonly<Record<string, unknown>>;

const isNode = (x: unknown): x is Node => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Every object with a string `kind` in `x`, `x` itself included, depth first. The definition of a token an effect
 * creates is left out: what the token can do is the token's, not the card's.
 */
function nodesOf(x: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(x)) {
    for (const y of x) nodesOf(y, out);
  } else if (isNode(x)) {
    if (typeof x.kind === 'string') out.push(x);
    for (const [key, v] of Object.entries(x)) if (key !== 'definition') nodesOf(v, out);
  }
  return out;
}

/** One part of a card that resolves on its own: its targets and every node of what it does. */
interface Unit {
  readonly specs: ReadonlyMap<string, TargetSpec>;
  readonly nodes: readonly Node[];
}

/** A spell, a triggered or an activated ability: its own targets and those of its modes. */
function unitOf(part: {
  readonly targets?: readonly TargetSpec[];
  readonly effect?: unknown;
  readonly modes?: readonly {
    readonly targets?: readonly TargetSpec[];
    readonly effect: unknown;
  }[];
}): Unit {
  const specs = new Map<string, TargetSpec>();
  const effects: unknown[] = [part.effect];
  for (const t of part.targets ?? []) specs.set(t.id, t);
  for (const m of part.modes ?? []) {
    for (const t of m.targets ?? []) specs.set(t.id, t);
    effects.push(m.effect);
  }
  return { specs, nodes: nodesOf(effects) };
}

const asNode = (x: unknown): Node | null => (isNode(x) ? x : null);

/** The object filter of a target slot, or null when the slot is not one of objects. */
function slotFilter(specs: ReadonlyMap<string, TargetSpec>, sel: unknown): Node | null {
  const s = asNode(sel);
  if (s === null || s.kind !== 'target' || typeof s.id !== 'string') return null;
  const what = asNode(specs.get(s.id)?.what);
  if (what === null) return null;
  if (what.kind === 'anyTarget') return {};
  return what.kind === 'object' ? asNode(what.filter) : null;
}

const listHas = (x: unknown, v: string): boolean => Array.isArray(x) && x.includes(v);

/** Whether a filter can match a permanent of one of `types` (no types named: any), its `anyOf` read. */
function canMatch(filter: Node, types: readonly string[]): boolean {
  const open = types.filter((t) => !listHas(filter.notTypes, t));
  if (open.length === 0) return false;
  if (Array.isArray(filter.anyOf)) return filter.anyOf.some((f) => isNode(f) && canMatch(f, open));
  return filter.types === undefined || open.some((t) => listHas(filter.types, t));
}

/** A filter of permanents on the battlefield that is not only the caster's own and can match `types`. */
function hostile(filter: Node, types: readonly string[]): boolean {
  if (filter.zone !== undefined && filter.zone !== 'battlefield') return false;
  if (filter.controller === 'you') return false;
  return canMatch(filter, types);
}

/** One target creature or planeswalker of the agent's: a target slot of a hostile filter, or any target. */
const spot = (u: Unit, sel: unknown): boolean => {
  const f = slotFilter(u.specs, sel);
  return f !== null && hostile(f, ['creature', 'planeswalker']);
};

/** Every creature of a hostile filter ("each creature", "each creature your opponents control"). */
const mass = (sel: unknown): boolean => {
  const s = asNode(sel);
  const f = s?.kind === 'each' ? asNode(s.filter) : null;
  return f !== null && hostile(f, ['creature']);
};

const HOSTILE_PLAYERS = new Set([
  'eachOpponent',
  'eachOtherOpponent',
  'eachPlayer',
  'defendingPlayer',
]);

/** A player selector that names an opponent of the caster: each opponent, or a target player. */
function hostilePlayer(u: Unit, sel: unknown): boolean {
  const s = asNode(sel);
  if (s === null || typeof s.kind !== 'string') return false;
  if (HOSTILE_PLAYERS.has(s.kind)) return true;
  if (s.kind === 'all') return Array.isArray(s.of) && s.of.some((x) => hostilePlayer(u, x));
  if (s.kind !== 'target' || typeof s.id !== 'string') return false;
  const what = asNode(u.specs.get(s.id)?.what)?.kind;
  return what === 'player' || what === 'anyTarget' || what === 'playerOrObject';
}

/** The sign of a power or toughness change: a number, "-1/-1 for each" (`times`), or a count (positive). */
function sign(x: unknown): number {
  if (typeof x === 'number') return Math.sign(x);
  const n = asNode(x);
  if (n?.kind === 'times' && typeof n.factor === 'number') return Math.sign(n.factor);
  return n === null ? 0 : 1;
}

/** What one effect node does to the agent's permanents: one of them, all its creatures, or nothing. */
function hostileReach(u: Unit, n: Node): 'spot' | 'mass' | null {
  const at = (sel: unknown): 'spot' | 'mass' | null =>
    spot(u, sel) ? 'spot' : mass(sel) ? 'mass' : null;
  switch (n.kind) {
    case 'destroy':
    case 'exile':
      return at(n.objects);
    case 'moveToZone':
      return n.to === 'battlefield' ? null : at(n.objects);
    case 'dealDamage':
    case 'dealDividedDamage':
      return at(n.to);
    case 'modifyPt':
      return sign(n.toughness) < 0 ? at(n.objects) : null;
    case 'fight':
      return spot(u, n.against) ? 'spot' : null;
    case 'sacrifice':
      return hostilePlayer(u, n.player) ? 'spot' : null;
    default:
      return null;
  }
}

/** Whether a selector names the caster's own creature: a target slot not of the opponents', or "each ... you control". */
function friendly(u: Unit, sel: unknown): boolean {
  const f = slotFilter(u.specs, sel);
  if (f !== null) return f.controller !== 'opponent';
  const s = asNode(sel);
  return s?.kind === 'each' && asNode(s.filter)?.controller === 'you';
}

/** A node that helps a creature of the caster's: a pump, a keyword, regeneration, phasing out. */
function helps(u: Unit, n: Node): boolean {
  switch (n.kind) {
    case 'modifyPt':
      return sign(n.power) > 0 && friendly(u, n.objects);
    case 'grantKeyword':
    case 'regenerate':
    case 'phaseOut':
      return friendly(u, n.objects);
    default:
      return false;
  }
}

/** All combat damage (or all damage) prevented, to more than one target: a Fog. */
const isFog = (n: Node): boolean =>
  n.kind === 'preventDamage' &&
  n.amount === 'all' &&
  (n.scope === 'combat' || n.scope === 'all') &&
  asNode(n.to)?.kind !== 'target';

/** A node that costs an opponent life: damage to it, or life lost. */
const drains = (u: Unit, n: Node): boolean =>
  ((n.kind === 'dealDamage' || n.kind === 'loseLife') &&
    hostilePlayer(u, n.kind === 'dealDamage' ? n.to : n.player)) ||
  (n.kind === 'dealDividedDamage' && hostilePlayer(u, n.to));

const isHasteGrant = (n: Node): boolean =>
  n.kind === 'grantKeyword' && asNode(n.keyword)?.kind === 'haste';

/** Whether a haste grant is to the permanent that has the ability ("this creature gains haste"). */
const toSelf = (n: Node): boolean => asNode(n.objects ?? n.subject)?.kind === 'this';

/** The faces a player can cast from the hand: the first, and the other of a split, Adventure or modal card. */
function castFaces(def: CardDefinition): readonly CardFace[] {
  const [first, second] = def.faces;
  if (first === undefined) return [];
  const either = def.layout === 'split' || def.layout === 'adventure' || def.layout === 'modal_dfc';
  return either && second !== undefined ? [first, second] : [first];
}

/** The abilities of a face, those behind a class level or a station threshold included. */
function abilitiesOf(face: CardFace): readonly Node[] {
  const out: Node[] = [];
  const add = (xs: readonly unknown[]): void => {
    for (const a of xs) {
      const n = asNode(a);
      if (n === null) continue;
      if (
        (n.kind === 'level' || n.kind === 'stationLevel' || n.kind === 'solved') &&
        Array.isArray(n.abilities)
      ) {
        add(n.abilities);
      } else out.push(n);
    }
  };
  add(face.abilities);
  return out;
}

const hasKeyword = (abilities: readonly Node[], kind: string): boolean =>
  abilities.some((a) => a.kind === 'keyword' && asNode(a.keyword)?.kind === kind);

/** The keywords that make a creature hard to block, or that double what it deals. */
const EVASION = [
  'flying',
  'trample',
  'menace',
  'shadow',
  'fear',
  'intimidate',
  'landwalk',
  'doubleStrike',
];

/** Whether a triggered ability is "When this enters". */
function entersItself(a: Node): boolean {
  const t = asNode(a.trigger);
  return t?.kind === 'entersBattlefield' && asNode(t.what)?.kind === 'this';
}

function readTraits(def: CardDefinition): CardTraits {
  const first = def.faces[0];
  const creature = first?.types.includes('creature') ?? false;
  const traits = {
    land: first?.types.includes('land') ?? false,
    creature,
    manaValue: first?.manaCost === null || first === undefined ? 0 : manaValue(first.manaCost),
    power: typeof first?.power === 'number' ? first.power : 0,
    instantSpeed: false,
    evasive: false,
    haste: false,
    hasteGiver: false,
    flash: false,
    counter: false,
    removal: false,
    wipe: false,
    trick: false,
    fog: false,
    reach: false,
    extraCombat: false,
    winsOutright: false,
  };
  let helpful = false;
  for (const face of castFaces(def)) {
    const abilities = abilitiesOf(face);
    const instantSpeed = face.types.includes('instant') || hasKeyword(abilities, 'flash');
    traits.instantSpeed ||= instantSpeed;
    if (face === first && creature) {
      traits.haste ||= hasKeyword(abilities, 'haste');
      traits.flash ||= hasKeyword(abilities, 'flash');
      traits.evasive ||= EVASION.some((k) => hasKeyword(abilities, k));
    }
    const spell = face.spell === null ? [] : [unitOf(face.spell)];
    const enters: Unit[] = [];
    const others: Unit[] = [];
    for (const a of abilities) {
      if (a.kind === 'triggered') (entersItself(a) ? enters : others).push(unitOf(a));
      else if (a.kind === 'activated') others.push(unitOf(a));
      else if (a.kind === 'static' && isHasteGrant(asNode(a.static) ?? {})) {
        if (toSelf(asNode(a.static) ?? {}) && creature) traits.haste = true;
        else traits.hasteGiver = true;
      }
    }
    for (const u of [...spell, ...enters]) {
      for (const n of u.nodes) {
        if (n.kind === 'counter' || n.kind === 'counterUnlessPays') traits.counter = true;
        const hit = hostileReach(u, n);
        if (hit === 'spot') traits.removal = true;
        if (hit === 'mass') traits.wipe = true;
      }
    }
    for (const u of spell) {
      for (const n of u.nodes) {
        if (isFog(n)) traits.fog = true;
        if (instantSpeed && !face.types.includes('creature') && helps(u, n)) helpful = true;
      }
    }
    for (const u of [...spell, ...enters, ...others]) {
      for (const n of u.nodes) {
        if (drains(u, n)) traits.reach = true;
        if (n.kind === 'extraCombat' || n.kind === 'extraBeginningPhase') traits.extraCombat = true;
        if (n.kind === 'winGame' || n.kind === 'extraTurn') traits.winsOutright = true;
        if (isHasteGrant(n)) {
          if (toSelf(n) && creature) traits.haste = true;
          else traits.hasteGiver = true;
        }
      }
    }
  }
  traits.trick = helpful && !traits.counter && !traits.removal && !traits.wipe;
  return traits;
}

const KEPT = new WeakMap<CardDefinition, CardTraits>();

/** The traits of a card (see the module comment), kept for each definition object: a pure function of it. */
export function traitsOf(def: CardDefinition): CardTraits {
  const kept = KEPT.get(def);
  if (kept !== undefined) return kept;
  const traits = readTraits(def);
  KEPT.set(def, traits);
  return traits;
}
