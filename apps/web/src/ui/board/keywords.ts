/**
 * Short glyph chips for keyword abilities (CR 702) and for restrictions and requirements (D-094);
 * the full name rides in the tooltip.
 */
import type { ObjectView, Restriction } from '@commander-arena/engine';
import { JOB_SELECT_REMINDER, LIVING_WEAPON_REMINDER } from '../../game/artifacts-text';
import { ESCALATE_REMINDER, hideawayReminder } from '../../game/dinosaurs-text';
import { DETHRONE_REMINDER, MYRIAD_REMINDER, READ_AHEAD_REMINDER } from '../../game/dragons-text';
import { EMBALM_REMINDER } from '../../game/embalm-text';
import { DECAYED_REMINDER } from '../../game/gisa-g5-text';
import { ETERNALIZE_REMINDER } from '../../game/hashaton-g5-text';
import {
  devourReminder,
  ENCORE_REMINDER,
  NINJUTSU_REMINDER,
  RIOT_REMINDER,
  SUNBURST_REMINDER,
} from '../../game/keywords-text';

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
  station: ['Stn', 'Station'],
  fear: ['Fear', 'Fear'],
  intimidate: ['Int', 'Intimidate'],
  shadow: ['Shd', 'Shadow'],
  landwalk: ['Lw', 'Landwalk'],
  // Keyword batch 1 (D-104, D-110).
  changeling: ['Chg', 'Changeling'],
  devoid: ['Dvd', 'Devoid'],
  exalted: ['Exl', 'Exalted'],
  annihilator: ['Ann', 'Annihilator'],
  // Azula deck (CR 702.189a): Firebending N.
  firebending: ['Fbd', 'Firebending'],
  // Gisa deck group 1 (D-472): Afflict N (CR 702.130a).
  afflict: ['Afl', 'Afflict'],
  // Issue 102: Dredge N (CR 702.52a).
  dredge: ['Dre', 'Dredge'],
  mobilize: ['Mob', 'Mobilize'],
  fabricate: ['Fab', 'Fabricate'],
  backup: ['Bkp', 'Backup'],
  persist: ['Per', 'Persist'],
  undying: ['Und', 'Undying'],
  infect: ['Inf', 'Infect'],
  wither: ['Wth', 'Wither'],
  toxic: ['Tox', 'Toxic'],
  splitSecond: ['Spl', 'Split second'],
  partner: ['Ptn', 'Partner'],
  // D-490 (CR 702.124j): the name rides in the tooltip (`PARAMETERIZED`).
  partnerWith: ['Ptn', 'Partner with'],
  typecycling: ['Tcy', 'Typecycling'],
  multikicker: ['MK', 'Multikicker'],
  // Keyword batch 2 (D-116, D-120). Regenerate is an activated ability, not a keyword: it has no chip.
  skulk: ['Skl', 'Skulk'],
  battleCry: ['BC', 'Battle cry'],
  mentor: ['Mnt', 'Mentor'],
  evolve: ['Evo', 'Evolve'],
  bushido: ['Bus', 'Bushido'],
  // CR 702.25a (Flanking).
  flanking: ['Flk', 'Flanking'],
  extort: ['Ext', 'Extort'],
  // Exploit (CR 702.110a).
  exploit: ['Exp', 'Exploit (When this creature enters, you may sacrifice a creature.)'],
  affinity: ['Aff', 'Affinity'],
  undaunted: ['Und', 'Undaunted'],
  convoke: ['Cvk', 'Convoke'],
  improvise: ['Imp', 'Improvise'],
  delve: ['Dlv', 'Delve'],
  cascade: ['Csc', 'Cascade'],
  // Prismari group 3 (D-666, D-667): Demonstrate and Retrace.
  demonstrate: ['Dem', 'Demonstrate'],
  retrace: ['Rtr', 'Retrace'],
  jumpStart: ['JmS', 'Jump-start'],
  aftermath: ['Aft', 'Aftermath'],
  // Ascend on a permanent (D-264, CR 702.131b).
  ascend: ['Asc', 'Ascend'],
  soulbond: ['Sbd', 'Soulbond'],
  // Start your engines! (issue 144, CR 702.179a).
  startYourEngines: ['Eng', 'Start your engines!'],
  // The upkeep slice (D-127).
  echo: ['Ech', 'Echo'],
  cumulativeUpkeep: ['CU', 'Cumulative upkeep'],
  // Copies of spells (D-129).
  storm: ['Stm', 'Storm'],
  gravestorm: [
    'GSt',
    'Gravestorm (When you cast this spell, copy it for each permanent put into a graveyard from the battlefield this turn.)',
  ],
  replicate: ['Rep', 'Replicate'],
  // Rebound (CR 702.88a): on an instant or a sorcery.
  rebound: ['Rbd', 'Rebound'],
  cipher: ['Cph', 'Cipher'],
  // Buyback (Galadriel group 3, CR 702.27a): the cost rides in the chip (`PARAMETERIZED`).
  buyback: ['Bb', 'Buyback'],
  // Gift a card (D-135).
  gift: ['Gft', 'Gift a card'],
  // The Artifacts slice (D-139): the reminder text rides in the tooltip (CR 702.92a).
  livingWeapon: ['LW', LIVING_WEAPON_REMINDER],
  // Job select (D-206).
  jobSelect: ['JS', JOB_SELECT_REMINDER],
  // The Dinosaurs slice (D-145): the cost or number rides in the chip (`PARAMETERIZED`), the reminder in the tooltip.
  escalate: ['Esc', 'Escalate'],
  hideaway: ['Hid', 'Hideaway'],
  // Vanishing (CR 702.63a): the number rides in the chip (`PARAMETERIZED`).
  vanishing: ['Van', 'Vanishing'],
  // The Dragons slice (D-151): the reminder text (CR 702.155a, 702.105a, 702.116a) rides in the tooltip.
  readAhead: ['RA', `Read ahead (${READ_AHEAD_REMINDER})`],
  dethrone: ['Dth', `Dethrone (${DETHRONE_REMINDER})`],
  melee: [
    'Mel',
    'Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)',
  ],
  myriad: ['Myr', `Myriad (${MYRIAD_REMINDER})`],
  // Gisa deck group 5 (D-478): the reminder text (CR 702.147a) rides in the tooltip.
  decayed: ['Dec', `Decayed (${DECAYED_REMINDER})`],
  // The Korvold slice 6 (D-185): the reminder text (CR 702.141a, 702.82a, 702.136a) rides in the tooltip; Devour's number is in `PARAMETERIZED`.
  encore: ['Enc', `Encore (${ENCORE_REMINDER})`],
  // Hashaton deck group 5 (D-384): Eternalize (CR 702.129a).
  eternalize: ['Et', `Eternalize (${ETERNALIZE_REMINDER})`],
  // Issue 104: Embalm (CR 702.128a).
  embalm: ['Emb', `Embalm (${EMBALM_REMINDER})`],
  // CR 702.49a (Ninjutsu, unverified): the cost rides in the chip (`PARAMETERIZED`), the reminder in the tooltip.
  ninjutsu: ['Nin', `Ninjutsu (${NINJUTSU_REMINDER})`],
  devour: ['Dev', 'Devour'],
  riot: ['Riot', `Riot (${RIOT_REMINDER})`],
  // CR 702.44a: Sunburst.
  sunburst: ['Sun', `Sunburst (${SUNBURST_REMINDER})`],
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
  // "Firebending 2": one chip per instance (CR 702.189a: each triggers separately).
  firebending: (text) => numbered(text, 'Firebending', 'Fbd'),
  // "Afflict 3": one chip per instance (CR 702.130b: each triggers separately).
  afflict: (text) => numbered(text, 'Afflict', 'Afl'),
  dredge: (text) => numbered(text, 'Dredge', 'Dre'),
  // "Mobilize 1": one chip per instance (CR 702.181a).
  mobilize: (text) => numbered(text, 'Mobilize', 'Mob'),
  // "Fabricate 2": one chip per instance (CR 702.123b).
  fabricate: (text) => numbered(text, 'Fabricate', 'Fab'),
  backup: (text) => numbered(text, 'Backup', 'Bkp'),
  // "Vanishing 3": one chip per instance (CR 702.63c: each works separately).
  vanishing: (text) => numbered(text, 'Vanishing', 'Van'),
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
  // "Buyback {2}": one chip per instance (CR 702.27a).
  buyback: (text) =>
    [...text.matchAll(/buyback\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Bb', withCost('Buyback', m[1] ?? '')] as const,
    ),
  // "Escalate {G}": the cost of each mode beyond the first (CR 702.120a), one chip per instance.
  escalate: (text) =>
    [...text.matchAll(/\bescalate\s*((?:\{[^}]+\})+|—[^.(\n]*)/gi)].map(
      (m) => ['Esc', `${withCost('Escalate', m[1] ?? '')} (${ESCALATE_REMINDER})`] as const,
    ),
  // "Devour 2": the number of counters for each creature sacrificed (CR 702.82a).
  devour: (text) =>
    [...text.matchAll(/\b[Dd]evour\s+(?:([A-Z][a-z]+)\s+)?(\d+)/g)].map(
      (m) =>
        [
          `Dev ${m[2]}`,
          `Devour ${m[1] === undefined ? '' : `${m[1]} `}${m[2]} (${devourReminder(Number(m[2]), m[1])})`,
        ] as const,
    ),
  // "Partner with Regna, the Redeemer" (D-490, CR 702.124j): the name of the card, from the line of the Oracle text the object shows.
  partnerWith: (text) =>
    [...text.matchAll(/\bpartner with ([^(\n]+)/gi)].map(
      (m) => ['Ptn', `Partner with ${(m[1] ?? '').trim()}`] as const,
    ),
  // "Encore {3}{R}": one chip per instance (CR 702.141a). Only a line that starts with the keyword is the
  // object's own: "Each Sliver creature card in your graveyard has encore {X}" gives it to other cards.
  encore: (text) =>
    [...text.matchAll(/^encore\s*((?:\{[^}]+\})+)/gim)].map(
      (m) => ['Enc', `${withCost('Encore', m[1] ?? '')} (${ENCORE_REMINDER})`] as const,
    ),
  // "Eternalize {5}{U}{U}": one chip per instance (CR 702.129a).
  eternalize: (text) =>
    [...text.matchAll(/\beternalize\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Et', `${withCost('Eternalize', m[1] ?? '')} (${ETERNALIZE_REMINDER})`] as const,
    ),
  // "Embalm {5}{W}": one chip per instance (CR 702.128a).
  embalm: (text) =>
    [...text.matchAll(/\bembalm\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Emb', `${withCost('Embalm', m[1] ?? '')} (${EMBALM_REMINDER})`] as const,
    ),
  // "Hideaway 4": the number of cards looked at (CR 702.75a).
  hideaway: (text) =>
    [...text.matchAll(/\bhideaway\s+(\d+)/gi)].map(
      (m) => [`Hid ${m[1]}`, `Hideaway ${m[1]} (${hideawayReminder(Number(m[1]))})`] as const,
    ),
  // "Ninjutsu {1}{R}": one chip per instance (CR 702.49a).
  ninjutsu: (text) =>
    [...text.matchAll(/\bninjutsu\s*((?:\{[^}]+\})+)/gi)].map(
      (m) => ['Nin', `${withCost('Ninjutsu', m[1] ?? '')} (${NINJUTSU_REMINDER})`] as const,
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
  // Issue 81 (CR 509.1b): the Gingerbrute token.
  cantBeBlockedExceptByHaste: ['UnblH', "Can't be blocked except by creatures with haste"],
  // CR 508.1a, 508.6: "can't attack a player it has already attacked this turn".
  cantAttackPlayersAlreadyAttacked: [
    'NoAtk',
    "Can't attack a player it has already attacked this turn",
  ],
  cantBeBlockedExceptByThreeOrMore: ['Unbl3', "Can't be blocked except by three or more creatures"],
  cantBeBlockedByMoreThanOne: ['Blk≤1', "Can't be blocked by more than one creature"],
  attacksEachCombat: ['Atk!', 'Attacks each combat'],
  mustBeBlocked: ['Blk!', 'Must be blocked if able'],
  mustBlock: ['Blk!', 'Must block this turn if able'],
  doesntUntap: ['NoUnt', "Doesn't untap"],
  cantBeCountered: ['NoCtr', "Can't be countered"],
  // Prismari group 2: "This creature can block only creatures with flying" (CR 509.1b).
  canBlockOnlyFlying: ['BlkFly', 'Can block only creatures with flying'],
  // Abzan Armor group A (CR 609.4, 702.3b, 510.1a).
  canAttackAsThoughNoDefender: ['AtkDef', "Can attack as though it didn't have defender"],
  canAttackAsThoughNoDefenderVsLastTurnAttackers: [
    'AtkDef',
    "Can attack players who attacked you during their last turn as though it didn't have defender",
  ],
  assignsDamageByToughness: ['DmgTgh', 'Assigns combat damage equal to its toughness'],
  // Galadriel group 3: "Its activated abilities can't be activated this turn" (CR 602.5).
  cantActivateAbilities: ['NoAct', "Its activated abilities can't be activated"],
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
