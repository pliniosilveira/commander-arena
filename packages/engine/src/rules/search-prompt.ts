/**
 * The plain-words prompt of a search decision (CR 701.23): what to look for, and where the cards
 * found go, in the order the player chooses them. For example:
 * "Choose up to two basic land cards; the first goes onto the battlefield tapped, the second into
 * your hand."
 */
import type { Effect, ObjectFilter } from '../ast/types';
import type { Color } from '../characteristics';

type SearchEffect = Extract<Effect, { kind: 'search' }>;

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const ORDINALS = [
  'zeroth',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
];

const COLOR_NAMES: Readonly<Record<Color, string>> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

const numberWord = (n: number): string => NUMBERS[n] ?? String(n);
const ordinalWord = (n: number): string => ORDINALS[n] ?? `number ${n}`;

/** The describing words of one filter without its `anyOf`: "nonland green basic Forest creature". */
function words(f: ObjectFilter): string[] {
  return [
    ...(f.notTypes ?? []).map((t) => `non${t}`),
    ...(f.colors ?? []).map((c) => COLOR_NAMES[c]),
    ...(f.supertypes ?? []),
    ...(f.subtypes ?? []),
    ...(f.types ?? []),
  ];
}

/** "basic land", "artifact or enchantment", "" for any card. */
export function describeFilter(f: ObjectFilter): string {
  const own = words(f).join(' ');
  if (f.anyOf === undefined) return own;
  const alternatives = f.anyOf.map((m) => words(m).join(' ')).filter((w) => w !== '');
  return [own, alternatives.join(' or ')].filter((w) => w !== '').join(' ');
}

function whereWords(d: SearchEffect['destinations'][number]): string {
  switch (d.zone) {
    case 'battlefield':
      return d.tapped === true ? 'onto the battlefield tapped' : 'onto the battlefield';
    case 'hand':
      return 'into your hand';
    case 'graveyard':
      return 'into your graveyard';
    default: {
      const unreachable: never = d.zone;
      return unreachable;
    }
  }
}

/** The clause for the cards from index `start` on that one destination takes (verb on the first). */
function clause(
  search: SearchEffect,
  index: number,
  start: number,
): { text: string; taken: number } {
  const d = search.destinations[index];
  if (d === undefined) return { text: '', taken: 0 };
  const left = search.max - start;
  const taken = d.count === 'rest' ? left : d.count;
  const verb = index === 0 ? (taken === 1 ? ' goes' : ' go') : '';
  let who: string;
  if (taken === 1 && search.max === 1) who = 'it';
  else if (taken === 1) who = `the ${ordinalWord(start + 1)}`;
  else if (d.count === 'rest') who = 'the rest';
  else who = `the ${start === 0 ? 'first' : 'next'} ${numberWord(taken)}`;
  return { text: `${who}${verb} ${whereWords(d)}`, taken };
}

/** The prompt of a search decision. */
export function describeSearch(search: SearchEffect): string {
  const what = describeFilter(search.filter);
  const noun = `${what === '' ? '' : `${what} `}${search.max === 1 ? 'card' : 'cards'}`;
  const clauses: string[] = [];
  let start = 0;
  for (let i = 0; i < search.destinations.length; i += 1) {
    const c = clause(search, i, start);
    clauses.push(c.text);
    start += c.taken;
  }
  const reveal = search.reveal ? ' The cards you find are revealed.' : '';
  const shuffle = search.shuffle ? ' Then your library is shuffled.' : '';
  return `Choose up to ${numberWord(search.max)} ${noun}; ${clauses.join(', ')}.${reveal}${shuffle}`;
}
