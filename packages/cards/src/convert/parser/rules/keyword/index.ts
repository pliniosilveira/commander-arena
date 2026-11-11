import { choice, literal, map, optional, pattern, separatedBy1, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';
import { affinityKeyword } from './affinity';
import { ALT_COST_KEYWORD_RULES } from './alt-costs';
import { ATTACHMENT_KEYWORD_RULES } from './attachments';
import { CASTING_KEYWORD_RULES } from './casting';
import { COMMANDER_KEYWORD_RULES } from './commander';
import { COPY_KEYWORD_RULES } from './copies';
import { ESCALATE_KEYWORD_RULES } from './escalate';
import { GIFT_KEYWORD_RULES } from './gift';
import { LATER_KEYWORD_RULES } from './later';
import { LIVING_WEAPON_KEYWORD_RULES } from './living-weapon';
import { numberedKeyword } from './numbered';
import { protectionKeyword } from './protection';
import { simpleKeyword } from './simple';
import { TYPECYCLING_RULES } from './typecycling';
import { UPKEEP_KEYWORD_RULES } from './upkeep';
import { plainWard, WARD_CREW_RULES } from './ward-crew';

const KEYWORD = choice(
  protectionKeyword('keyword.line'),
  simpleKeyword('keyword.line'),
  numberedKeyword('keyword.line'),
  affinityKeyword('keyword.line'),
);
const SEPARATOR = pattern(/[,;]\s*/);

/**
 * `keyword.line`: a line made only of keywords without parameters, separated by commas or
 * semicolons ("Flying, first strike"); one IR keyword each (CR 702: keyword abilities). Every
 * keyword the grammar knows is recognised; whether the engine runs it is the lowering's
 * business (`keyword:<kind>` in `needs`). Stage P17 added the keywords of the engine's keyword batch 1
 * (Changeling, Devoid, Partner, Exalted, Persist, Undying, Infect, Wither, Split second) and the two
 * that take a whole number ("Toxic 1", "Annihilator 2"). Stage P21 added the keywords of the engine's
 * keyword batch 2 (D-116, D-120): Skulk, Battle cry, Mentor, Evolve, Extort, Convoke, Improvise, Delve and
 * Cascade, "Bushido N" and "Affinity for [permanents]" (card types and subtypes of what the caster
 * controls: "artifacts", "artifact creatures", "Plains", "Equipment"). Ninjutsu
 * is a keyword the engine does not run, so no rule reads it; Storm and Replicate are read by rules of their own (stage P27, `keyword.storm`, `keyword.replicate`); Echo and Cumulative upkeep are
 * read by rules of their own (stage P25, `keyword.echo`, `keyword.cumulative-upkeep`), and so are Suspend,
 * Madness and Foretell (stage P26, `keyword.suspend`, `keyword.madness`, `keyword.foretell`). Overload, Evoke and Dash
 * are alternative costs of the face, read by rules of their own (stage P22, `keyword.overload`, `keyword.evoke`,
 * `keyword.dash`), and so are Spectacle, Escape and Unearth (stage P23, `keyword.spectacle`, `keyword.escape`,
 * `keyword.unearth`), and Encore (stage P40, D-186, `keyword.encore`: a rule of its own like Unearth). Riot and "Devour N" are read here (stage P40). "Choose a Background" is read since stage P35 (D-176, CR 702.124k): a deck-construction ability, as Partner, with no
 * effect in the game. The other forms of Partner ("Partner with
 * [name]", "Partner—Friends forever", "Doctor's companion", CR 702.124) are
 * other abilities the engine does not build, so they are not read. A keyword with another parameter
 * (a "Protection from" a quality that is not a color) is not part of the rule, so the whole line stays unparsed; Cycling,
 * typecycling, Equip, Enchant, Kicker, Multikicker, Flashback, Overload, Evoke, Dash, Spectacle, Escape, Unearth, Ward and Crew have
 * rules of their own. The one parameterised keyword a list may end with is a ward
 * with a plain mana cost ("Flying, ward {2}", CR 702.21a; 22 cards in the backlog have the shape
 * "Flying, ward {M}"); ward first or in the middle, other costs and other keywords with a parameter
 * are not read, and "Ward {2}" alone is `keyword.ward`.
 */
export const KEYWORD_LINE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.line',
  family: 'keyword',
  leading: [],
  cites: [
    'CR 702.1 (Keyword Abilities)',
    'CR 702.108a (Prowess)',
    'CR 702.73a (Changeling)',
    'CR 702.114a (Devoid)',
    'CR 702.124h (Partner)',
    'CR 702.83a (Exalted)',
    'CR 702.86a (Annihilator)',
    'CR 702.79a (Persist)',
    'CR 702.93a (Undying)',
    'CR 702.90a (Infect)',
    'CR 702.80a (Wither)',
    'CR 702.164a (Toxic)',
    'CR 702.61a (Split Second)',
    'CR 702.118a (Skulk)',
    'CR 702.91a (Battle Cry)',
    'CR 702.134a (Mentor)',
    'CR 702.100a (Evolve)',
    'CR 702.45a (Bushido)',
    'CR 702.101a (Extort)',
    'CR 702.41a (Affinity)',
    'CR 702.51a (Convoke)',
    'CR 702.126a (Improvise)',
    'CR 702.66a (Delve)',
    'CR 702.85a (Cascade)',
    'CR 702.82a (Devour)',
    'CR 702.136a (Riot)',
  ],
  examples: [
    'Flying',
    'first strike',
    'Flying, first strike, lifelink',
    'Flying; trample',
    'Trample,haste',
    'Prowess',
    'Flying, prowess',
    'Flying, ward {2}',
    'Flying, first strike, ward {1}{W}',
    'Haste; ward {3}',
    'Changeling',
    'Devoid',
    'Partner',
    'Exalted',
    'Persist',
    'Undying',
    'Infect',
    'Wither',
    'Split second',
    'split second',
    'Toxic 1',
    'Annihilator 2',
    'Flying, infect',
    'Infect, wither',
    'Trample, toxic 1',
    'Flying; exalted',
    'Haste, annihilator 3, ward {2}',
    'Flying, changeling, undying',
    'Skulk',
    // Stage P35 (D-176, CR 702.124k): a deck-construction ability with no effect in the game.
    'Choose a Background',
    'choose a background',
    'Battle cry',
    'battle cry',
    'Mentor',
    'Evolve',
    'Extort',
    'Convoke',
    'Improvise',
    'Delve',
    'Cascade',
    'Bushido 1',
    'Bushido 2',
    // Stage P40 (D-186, CR 702.82a, 702.136a): Devour N and Riot.
    'Riot',
    'riot',
    'Devour 1',
    'Devour 2',
    'Flying, devour 2',
    'Trample, riot',
    'Affinity for artifacts',
    'Affinity for artifact creatures',
    'Affinity for Plains',
    'Affinity for Islands',
    'Affinity for Equipment',
    'Flying, skulk',
    'Haste; battle cry',
    'Flying, bushido 1',
    'Cascade, cascade',
    'Convoke; improvise',
    'Delve, flying',
    'Flying, affinity for artifacts',
    'Affinity for artifacts, flying',
    'Vigilance, mentor, ward {2}',
    // Stage P68 (D-229, CR 702.16): protection from a color.
    'Protection from red',
    'Flying, protection from black',
    'Protection from white and from blue',
    'Flying, protection from red and from green, haste',
  ],
  rejects: [
    'Ward {2}',
    'Protection from monocolored',
    'Protection from artifacts',
    'Protection from everything',
    'Protection from red and blue',
    'Protection from red and from red',
    'Protection from',
    'Protection from red.',
    'Flashback {2}{R}',
    'Flyingx',
    'Flying.',
    'Flying,',
    'Prowessx',
    'Flying, ward {2}, haste',
    'Flying, ward {X}',
    'Flying, ward',
    'Flying, ward—Pay 2 life.',
    'Flying, ward—Discard a card.',
    'Flying ward {2}',
    'Ward {2}, flying',
    'Flying, ward {2}.',
    'Partner with a friend',
    'Partner—Friends forever',
    'Partner—Character select',
    'Friends forever',
    'Doctor’s companion',
    'Toxic',
    'Toxic 0',
    'Toxic X',
    'Toxic two',
    'Toxic 1.',
    'Toxic 1 2',
    'Annihilator',
    'Annihilator 0',
    'Annihilator 02',
    'Annihilator X',
    'Infectious',
    'Split',
    'Split second.',
    'Persist {1}',
    'Flying, toxic',
    'Skulkx',
    'Skulk.',
    'Evolved',
    'Mentor {1}',
    'Cascade {2}',
    'Convoke {C}',
    'Delve {1}',
    'Improvise.',
    'Battlecry',
    'Battle cries',
    'Bushido',
    'Bushido 0',
    'Bushido X',
    'Bushido 1.',
    'Bushido one',
    'Affinity',
    'Affinity for',
    'Affinity for artifact',
    'Affinity for artifacts you control',
    'Affinity for each artifact',
    'Affinity for artifacts.',
    'Affinity for nonland permanents',
    'Affinity for red permanents',
    'Affinity for creatures with power 4 or greater',
    'Affinity for tapped artifacts',
    'Affinity for artifacts and Equipment',
    'Storm',
    'Cumulative upkeep {1}',
    'Madness {1}{R}',
    'Unearth {2}{B}',
    'Encore {3}{R}',
    'Riot.',
    'Riot {1}',
    'Riots',
    'Devour',
    'Devour 0',
    'Devour X',
    'Devour two',
    'Devour 2.',
    'Devour creature 1',
    'Devour artifact 2',
    'Ninjutsu {1}{U}',
    'Overload {2}{R}',
    'Flying, storm',
  ],
  parse: map(
    sequence(
      separatedBy1(KEYWORD, SEPARATOR),
      optional(
        map(sequence(SEPARATOR, plainWard('keyword.line')), ([, ward]) => ward),
        null,
      ),
    ),
    ([keywords, ward]): readonly IrKeyword[] => (ward === null ? keywords : [...keywords, ward]),
  ),
});

/**
 * `keyword.cycling`: "Cycling {2}" and "Cycling—Pay 2 life" with an optional final period (the dash
 * form is an action, so it probably ends like a sentence in real text, as Kicker's and Flashback's
 * do; UNVERIFIED for Cycling, no card in the backlog has it) (CR 702.29a: "[Cost], Discard this card:
 * Draw a card", an activated ability that works only from the hand). The cost is a plain mana cost
 * or a payment of life, the two the engine pays for it; "Plainscycling {2}", "Basic landcycling" and
 * a cost of anything else are other keywords and stay unread.
 */
export const KEYWORD_CYCLING = defineRule<readonly IrKeyword[]>({
  id: 'keyword.cycling',
  family: 'keyword',
  leading: ['cycling', 'cycling—pay'],
  cites: ['CR 702.29a (Cycling)', 'CR 702.29 (Cycling)', 'CR 118.1 (Costs)'],
  examples: [
    'Cycling {2}',
    'Cycling {G}',
    'Cycling {1}{U}',
    'Cycling—Pay 2 life',
    'Cycling—Pay 2 life.',
    'cycling {3}',
  ],
  rejects: [
    'Cycling',
    'Cycling {X}',
    'Cycling {W/U}',
    'Cycling {2}.',
    'Cycling—Discard a card',
    'Cycling—Pay 0 life',
    'Cycling—Pay 2 life..',
    'Plainscycling {2}',
    'Cycling {2}, cycling {3}',
    'Cycling {2} and flying',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.cycling',
      map(
        choice<IrCost>(
          map(
            sequence(literal('cycling '), family<IrCost>('cost', { only: ['cost.mana'] })),
            ([, cost]) => cost,
          ),
          // A cost that is an action ends like a sentence, as Kicker and Flashback do (the
          // corpus's real text for those has the period); the plain `{M}` form has none.
          map(
            sequence(
              literal('cycling—'),
              family<IrCost>('cost', { only: ['cost.pay-life'] }),
              optional(literal('.'), null),
            ),
            ([, cost]) => cost,
          ),
        ),
        (cost): readonly IrCost[] => [cost],
      ),
      (cost) => ({ kind: 'keyword', name: 'cycling', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const KEYWORD_RULES = [
  KEYWORD_LINE,
  KEYWORD_CYCLING,
  ...TYPECYCLING_RULES,
  ...ATTACHMENT_KEYWORD_RULES,
  ...CASTING_KEYWORD_RULES,
  ...ALT_COST_KEYWORD_RULES,
  ...UPKEEP_KEYWORD_RULES,
  ...LATER_KEYWORD_RULES,
  ...COPY_KEYWORD_RULES,
  ...GIFT_KEYWORD_RULES,
  ...LIVING_WEAPON_KEYWORD_RULES,
  ...COMMANDER_KEYWORD_RULES,
  ...ESCALATE_KEYWORD_RULES,
  ...WARD_CREW_RULES,
];
