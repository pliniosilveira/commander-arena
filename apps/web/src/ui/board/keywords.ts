/**
 * Short glyph chips for keyword abilities (CR 702) and for restrictions and requirements (D-094);
 * the full name rides in the tooltip.
 */
import type { ObjectView, Restriction } from '@commander-arena/engine';
import { JOB_SELECT_REMINDER, LIVING_WEAPON_REMINDER } from '../../game/artifacts-text';
import { ESCALATE_REMINDER, hideawayReminder } from '../../game/dinosaurs-text';
import { DETHRONE_REMINDER, MYRIAD_REMINDER, READ_AHEAD_REMINDER } from '../../game/dragons-text';
import { ETERNALIZE_REMINDER } from '../../game/hashaton-g5-text';
import { devourReminder, ENCORE_REMINDER, RIOT_REMINDER } from '../../game/keywords-text';

const LABELS: Readonly<Record<string, readonly [short: string, full: string]>> = {
  flying: ['Fly', 'Flying'],
  firstStrike: ['FS', 'First strike'],
  doubleStrike: ['DS', 'Double strike'],
  deathtouch: ['DT', 'Deathtouch'],
  defender: ['Def', 'Defender'],
  haste: ['Hst', 'Haste'],
  hexproof: ['Hex', 'Hexproof'],
  shroud: ['Shr', 'Shroud'],
  indestructible: ['Ind', 'Indestructible'],
  lifelink: ['LL', 'Lifelink'],
  menace: ['Men', 'Menace'],
  reach: ['Rch', 'Reach'],
  trample: ['Trm', 'Trample'],
  vigilance: ['Vig', 'Vigilance'],
  flash: ['Fls', 'Flash'],
  ward: ['Wrd', 'Ward'],
  protection: ['Pro', 'Protection'],
  crew: ['Crew', 'Crew'],
  fear: ['Fear', 'Fear'],
  intimidate: ['Int', 'Intimidate'],
  shadow: ['Shd', 'Shadow'],
  landwalk: ['Lw', 'Landwalk'],
  // Keyword batch 1 (D-104, D-110).
  changeling: ['Chg', 'Changeling'],
  devoid: ['Dvd', 'Devoid'],
  exalted: ['Exl', 'Exalted'],
  annihilator: ['Ann', 'Annihilator'],
  backup: ['Bkp', 'Backup'],
  persist: ['Per', 'Persist'],
  undying: ['Und', 'Undying'],
  infect: ['Inf', 'Infect'],
  wither: ['Wth', 'Wither'],
  toxic: ['Tox', 'Toxic'],
  splitSecond: ['Spl', 'Split second'],
  partner: ['Ptn', 'Partner'],
  typecycling: ['Tcy', 'Typecycling'],
  multikicker: ['MK', 'Multikicker'],
  // Keyword batch 2 (D-116, D-120). Regenerate is an activated ability, not a keyword: it has no chip.
  skulk: ['Skl', 'Skulk'],
  battleCry: ['BC', 'Battle cry'],
  mentor: ['Mnt', 'Mentor'],
  evolve: ['Evo', 'Evolve'],
  bushido: ['Bus', 'Bushido'],
  extort: ['Ext', 'Extort'],
  affinity: ['Aff', 'Affinity'],
  convoke: ['Cvk', 'Convoke'],
  improvise: ['Imp', 'Improvise'],
  delve: ['Dlv', 'Delve'],
  cascade: ['Csc', 'Cascade'],
  // Ascend on a permanent (D-264, CR 702.131b).
  ascend: ['Asc', 'Ascend'],
  soulbond: ['Sbd', 'Soulbond'],
  // The upkeep slice (D-127).
  echo: ['Ech', 'Echo'],
  cumulativeUpkeep: ['CU', 'Cumulative upkeep'],
  // Copies of spells (D-129).
  storm: ['Stm', 'Storm'],
  replicate: ['Rep', 'Replicate'],
  // Gift a card (D-135).
  gift: ['Gft', 'Gift a card'],
  // The Artifacts slice (D-139): the reminder text rides in the tooltip (CR 702.92a).
  livingWeapon: ['LW', LIVING_WEAPON_REMINDER],
  // Job select (D-206).
  jobSelect: ['JS', JOB_SELECT_REMINDER],
  // The Dinosaurs slice (D-145): the cost or number rides in the chip (`PARAMETERIZED`), the reminder in the tooltip.
  escalate: ['Esc', 'Escalate'],
  hideaway: ['Hid', 'Hideaway'],
  // The Dragons slice (D-151): the reminder text (CR 702.155a, 702.105a, 702.116a) rides in the tooltip.
  readAhead: ['RA', `Read ahead (${READ_AHEAD_REMINDER})`],
  dethrone: ['Dth', `Dethrone (${DETHRONE_REMINDER})`],
  myriad: ['Myr', `Myriad (${MYRIAD_REMINDER})`],
  // The Korvold slice 6 (D-185): the reminder text (CR 702.141a, 702.82a, 702.136a) rides in the tooltip; Devour's number is in `PARAMETERIZED`.
  encore: ['Enc', `Encore (${ENCORE_REMINDER})`],
  // Hashaton deck group 5 (D-384): Eternalize (CR 702.129a).
  eternalize: ['Et', `Eternalize (${ETERNALIZE_REMINDER})`],
  devour: ['Dev', 'Devour'],
  riot: ['Riot', `Riot (${RIOT_REMINDER})`],
};

/**
 * The keywords whose rules text carries a number or a cost the view does not (`ObjectView.keywords`
 * lists kinds only): read from the Oracle text the object shows, one chip per instance (CR 702.86b,
 * 702.164b: each counts), as `[short, full]`. A keyword granted by an effect has no such text, and
 * its chip is the bare name, never a guessed number.
 */
const PARAMETERIZED: Readonly<
  Record<string, (text: string) => readonly (readonly [short: string, full: string])[]>
> = {
  annihilator: (text) => numbered(text, 'Annihilator', 'Ann'),
  backup: (text) => numbered(text, 'Backup', 'Bkp'),
  toxic: (text) => numbered(text, 'Toxic', 'Tox'),
  // "Bushido 1": one chip per instance (CR 702.45b: each triggers).
  bushido: (text) => numbered(text, 'Bushido', 'Bus'),
  // "Affinity for artifacts": the chip names what is counted (CR 702.41a), one per instance.
  affinity: (text) =>
    [...text.matchAll(/\baffinity for ([^.(\n,]+)/gi)].map(
      (m) => ['Aff', `Affinity for ${(m[1] ?? '').trim()}`] as const,
    ),
  // "Echo {1}{R}": one chip per instance (CR 702.30a: each triggers separately).
  echo: (text) =>
    [...text.matchAll(/\becho\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Ech', withCost('Echo', m[1] ?? '')] as const,
    ),
  // "Cumulative upkeep {1}" or "Cumulative upkeep—Pay 1 life.": one chip per instance (CR 702.24a).
  cumulativeUpkeep: (text) =>
    [...text.matchAll(/cumulative upkeep\s*((?:\{[^}]+\})+|—[^.(\n]*)/gi)].map(
      (m) => ['CU', withCost('Cumulative upkeep', m[1] ?? '')] as const,
    ),
  // "Replicate {2}": one chip per instance (CR 702.56a).
  replicate: (text) =>
    [...text.matchAll(/replicate\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Rep', withCost('Replicate', m[1] ?? '')] as const,
    ),
  // "Escalate {G}": the cost of each mode beyond the first (CR 702.120a), one chip per instance.
  escalate: (text) =>
    [...text.matchAll(/\bescalate\s*((?:\{[^}]+\})+|—[^.(\n]*)/gi)].map(
      (m) => ['Esc', `${withCost('Escalate', m[1] ?? '')} (${ESCALATE_REMINDER})`] as const,
    ),
  // "Devour 2": the number of counters for each creature sacrificed (CR 702.82a).
  devour: (text) =>
    [...text.matchAll(/\bdevour\s+(\d+)/gi)].map(
      (m) => [`Dev ${m[1]}`, `Devour ${m[1]} (${devourReminder(Number(m[1]))})`] as const,
    ),
  // "Encore {3}{R}": one chip per instance (CR 702.141a).
  encore: (text) =>
    [...text.matchAll(/\bencore\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Enc', `${withCost('Encore', m[1] ?? '')} (${ENCORE_REMINDER})`] as const,
    ),
  // "Eternalize {5}{U}{U}": one chip per instance (CR 702.129a).
  eternalize: (text) =>
    [...text.matchAll(/\beternalize\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Et', `${withCost('Eternalize', m[1] ?? '')} (${ETERNALIZE_REMINDER})`] as const,
    ),
  // "Hideaway 4": the number of cards looked at (CR 702.75a).
  hideaway: (text) =>
    [...text.matchAll(/\bhideaway\s+(\d+)/gi)].map(
      (m) => [`Hid ${m[1]}`, `Hideaway ${m[1]} (${hideawayReminder(Number(m[1]))})`] as const,
    ),
  multikicker: (text) =>
    [...text.matchAll(/multikicker\s*((?:\{[^}]+\})+|—[^.(\n]*)/gi)].map(
      (m) => ['MK', withCost('Multikicker', m[1] ?? '')] as const,
    ),
  typecycling: (text) =>
    [...text.matchAll(/\b((?:basic )?\w+cycling)\s*((?:\{[^}]+\})+|—[^.(\n]*)/gi)].map(
      (m) => ['Tcy', withCost(capitalized(m[1] ?? ''), m[2] ?? '')] as const,
    ),
};

/** "Multikicker {1}" or "Multikicker—Pay 2 life": a dash cost joins without a space, as printed. */
function withCost(word: string, cost: string): string {
  const c = cost.trim();
  return c.startsWith('—') ? `${word}${c}` : `${word} ${c}`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Annihilator 2" in the text gives `['Ann 2', 'Annihilator 2']`, once per instance. */
function numbered(
  text: string,
  word: string,
  short: string,
): readonly (readonly [short: string, full: string])[] {
  return [...text.matchAll(new RegExp(`\\b${word}\\s+(\\d+)`, 'gi'))].map(
    (m) => [`${short} ${m[1]}`, `${word} ${m[1]}`] as const,
  );
}

const RESTRICTIONS: Readonly<Record<Restriction, readonly [short: string, full: string]>> = {
  cantAttack: ['NoAtk', "Can't attack"],
  cantBlock: ['NoBlk', "Can't block"],
  cantBeBlocked: ['Unbl', "Can't be blocked"],
  cantBeBlockedByMoreThanOne: ['Blk≤1', "Can't be blocked by more than one creature"],
  attacksEachCombat: ['Atk!', 'Attacks each combat'],
  mustBeBlocked: ['Blk!', 'Must be blocked if able'],
  doesntUntap: ['NoUnt', "Doesn't untap"],
  cantBeCountered: ['NoCtr', "Can't be countered"],
};

/** "Islandwalk" for a landwalk of Island, "Nonbasic landwalk" for the nonbasic one (CR 702.14). */
export function landwalkName(landType: string): string {
  return landType === 'nonbasic' ? 'Nonbasic landwalk' : `${landType}walk`;
}

export function restrictionShort(r: Restriction): string {
  return RESTRICTIONS[r][0];
}

export function restrictionName(r: Restriction): string {
  return RESTRICTIONS[r][1];
}

export interface Chip {
  readonly key: string;
  readonly short: string;
  readonly full: string;
  readonly restriction: boolean;
}

/**
 * The chips of an object: its keywords (a landwalk is one chip per land type, named for it), then
 * its restrictions and requirements. Both come from the engine's view, so a "can't be blocked"
 * given by an effect shows like one printed on the card.
 */
export function chipsOf(
  o: Pick<ObjectView, 'keywords' | 'restrictions' | 'landwalks'> & {
    readonly oracleText?: string;
    readonly regenerationShields?: number;
  },
): Chip[] {
  const chips: Chip[] = [];
  for (const k of o.keywords) {
    const walks = k === 'landwalk' ? (o.landwalks ?? []) : [];
    const found = PARAMETERIZED[k]?.(o.oracleText ?? '') ?? [];
    if (found.length > 0) {
      found.forEach(([short, full], i) => {
        chips.push({ key: `${k}:${i}`, short, full, restriction: false });
      });
      continue;
    }
    if (walks.length === 0) {
      chips.push({ key: k, short: keywordShort(k), full: keywordName(k), restriction: false });
    }
    for (const type of walks) {
      chips.push({
        key: `landwalk:${type}`,
        short: keywordShort(k),
        full: landwalkName(type),
        restriction: false,
      });
    }
  }
  const shields = o.regenerationShields ?? 0;
  if (shields > 0) chips.push(shieldChip(shields));
  for (const r of o.restrictions ?? []) {
    chips.push({
      key: `restriction:${r}`,
      short: restrictionShort(r),
      full: restrictionName(r),
      restriction: true,
    });
  }
  return chips;
}

/**
 * The chip of a regeneration shield (CR 701.19a, D-120): "Regeneration shield" for one, "Regeneration
 * shield ×2" for two, which are used up one at a time and end with the turn.
 */
export function shieldChip(count: number): Chip {
  return {
    key: 'regeneration-shield',
    short: count > 1 ? `Reg ×${count}` : 'Reg',
    full: count > 1 ? `Regeneration shield ×${count}` : 'Regeneration shield',
    restriction: false,
  };
}

function spaced(kind: string): string {
  const words = kind.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function keywordShort(kind: string): string {
  return LABELS[kind]?.[0] ?? spaced(kind).slice(0, 3);
}

export function keywordName(kind: string): string {
  return LABELS[kind]?.[1] ?? spaced(kind);
}
