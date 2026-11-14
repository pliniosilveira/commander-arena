// Hidden information of face-down permanents (CR 708.5, 708.9, 701.40a, D-312): nobody but the player who controls a face-down permanent may look at it. The audits:
//
// 1. The two worlds: the same game played twice, the only difference being which cards the face-down permanents are (and which card the player manifests). The complete
//    `GameView` of the other seat and every event of every action must be the same text in both worlds, step by step, until a card is revealed (it leaves the battlefield,
//    CR 708.9): so nothing the other seat can see depends on the hidden card. This is stronger than searching for names, and it is checked too: the name, the oracle id,
//    the rules text and the card id of every hidden card must not appear in anything the other seat is shown.
// 2. Every field of `ObjectView` and every kind of `GameEvent` is classified below (a table typed by the keys, so a new field or kind does not compile until it is), and the
//    classification is checked against what the views and events really hold.
// 3. `determinize` (the sample an AI plays on) agrees with the view of the seat it is made for, and does not hand the real card of a face-down permanent over.
// 4. The controller sees the card.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-manifest.ts) and the two secrets and the commander defined here, with oracle ids, which the fixtures lack.
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  createRng,
  determinize,
  type GameEvent,
  type GameView,
  getView,
  type ObjectView,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SELF = 'SYNTHETIC Manifest Self';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const secret = (name: string, oracleId: string, text: string, cost: string[]): CardDefinition => ({
  ...singleFaceCard({
    name,
    manaCost: cost,
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText: text,
    abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
  }),
  oracleId,
});
const ALPHA = secret(
  'SYNTHETIC Secret Alpha',
  '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Flying (alpha secret text)',
  ['2', 'R'],
);
const BRAVO = secret(
  'SYNTHETIC Secret Bravo',
  '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Flying (bravo secret text)',
  ['3', 'R'],
);
const CHARLIE = secret(
  'SYNTHETIC Secret Charlie',
  '33333333-cccc-4ccc-8ccc-cccccccccccc',
  'Flying (charlie secret text)',
  ['4', 'R'],
);

/** A card that is not a creature card, so the two worlds differ in kind too (a land and a creature): it can be manifested and never turned face up. */
const DELTA: CardDefinition = {
  ...singleFaceCard({
    name: 'SYNTHETIC Secret Delta',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add {C}. (delta secret text)',
  }),
  oracleId: '55555555-eeee-4eee-8eee-eeeeeeeeeeee',
};

type Builder = ReturnType<typeof scenario>;

interface World {
  /** The card of the face-down permanent that is already on the battlefield, labelled `down`. */
  readonly placed: string;
  /** The card on top of seat 1's library, which seat 1 manifests. */
  readonly top: string;
}

/** Seat 1 plays the turn (turn 4, precombat main), seat 0 is the viewer with a Bolt and a creature. */
function build(world: World): ScenarioGame {
  const b: Builder = scenario()
    .define(ALPHA)
    .define(BRAVO)
    .define(CHARLIE)
    .define(DELTA)
    .seat(0)
    .life(20)
    .hand('Lightning Bolt')
    .battlefield('Mountain', { count: 2 })
    .battlefield('Grizzly Bears')
    .library(...FILLER)
    .seat(1)
    .life(20)
    .hand(SELF)
    .battlefield('Forest', { count: 4 })
    .battlefield(world.placed, { faceDown: true, label: 'down' })
    .library(world.top, ...FILLER);
  return b.at('precombatMain', { active: 1, turn: 4 }).build();
}

interface Snapshot {
  readonly step: string;
  readonly view: string;
  readonly events: string;
}

/** What the other seat (seat 0) is shown now and what happened since `mark`. */
function snapshot(g: ScenarioGame, step: string, mark: number): Snapshot {
  return {
    step,
    view: JSON.stringify(g.view(0)),
    events: JSON.stringify(g.eventsSince(mark)),
  };
}

/**
 * The scripted flow, up to the point where a hidden card is revealed: a manifest (the cast, the resolution), a face-down creature attacking and dealing damage, a spell targeting it
 * on the stack. Returns what seat 0 sees and the events, at each step.
 */
function flow(g: ScenarioGame): Snapshot[] {
  const out: Snapshot[] = [];
  let mark = g.mark();
  out.push(snapshot(g, 'start', mark));
  g.act(1).cast(SELF, { pay: true });
  out.push(snapshot(g, 'manifest spell on the stack', mark));
  mark = g.mark();
  g.passAll();
  out.push(snapshot(g, 'manifested', mark));
  mark = g.mark();
  g.playCombat({ attack: ['down'], until: 'postcombatMain' });
  out.push(snapshot(g, 'a face-down creature attacked unblocked', mark));
  mark = g.mark();
  g.pass(1);
  g.act(0).cast('Lightning Bolt', { targets: ['down'], pay: true });
  out.push(snapshot(g, 'a spell targets it', mark));
  return out;
}

const ALPHA_WORLD: World = { placed: ALPHA.name, top: CHARLIE.name };
const BRAVO_WORLD: World = { placed: BRAVO.name, top: DELTA.name };

/** The strings that name a card: its name, its oracle id, its rules text and the id of the card. */
function secretsOf(g: ScenarioGame): string[] {
  const out: string[] = [];
  for (const id of g.state.battlefield) {
    const o = g.state.objects[id];
    if (o?.faceDown === undefined || o.card === null) continue;
    const card = g.state.cards[o.card];
    const def = card === undefined ? undefined : g.state.definitions[card.definition];
    if (card === undefined || def === undefined) continue;
    out.push(def.name, o.card);
    if (def.oracleId !== null) out.push(def.oracleId);
    const text = def.faces[0]?.oracleText ?? '';
    if (text !== '') out.push(text);
  }
  return out;
}

describe('the two worlds (the hidden card is the only difference)', () => {
  const a = build(ALPHA_WORLD);
  const b = build(BRAVO_WORLD);
  const sa = flow(a);
  const sb = flow(b);

  test('the flow reached its end in both worlds, with face-down permanents on the table', () => {
    expect(sa.map((s) => s.step)).toEqual(sb.map((s) => s.step));
    expect(sa).toHaveLength(5);
    expect(a.state.stack).toHaveLength(1);
    expect(b.state.stack).toHaveLength(1);
    // Two face-down permanents of seat 1: the one placed and the one manifested.
    expect(
      a.state.battlefield.filter((id) => a.state.objects[id]?.faceDown !== undefined),
    ).toHaveLength(2);
  });

  test('the view of the other seat is the same text in both worlds at every step', () => {
    for (const [i, step] of sa.entries()) {
      expect(JSON.parse(sb[i]?.view ?? 'null'), step.step).toEqual(JSON.parse(step.view));
    }
  });

  test('every event of every action is the same text in both worlds', () => {
    for (const [i, step] of sa.entries()) {
      expect(JSON.parse(sb[i]?.events ?? 'null'), step.step).toEqual(JSON.parse(step.events));
    }
  });

  test('no step shows the other seat a name, an oracle id, a rules text or a card id of a hidden card', () => {
    for (const [g, steps] of [
      [a, sa],
      [b, sb],
    ] as const) {
      const secrets = secretsOf(g);
      expect(secrets.length).toBeGreaterThan(4);
      for (const step of steps) {
        for (const text of secrets) {
          expect(step.view.includes(JSON.stringify(text)), `view at ${step.step}: ${text}`).toBe(
            false,
          );
          expect(
            step.events.includes(JSON.stringify(text)),
            `events at ${step.step}: ${text}`,
          ).toBe(false);
        }
      }
    }
  });

  test('the same holds for the whole state a sample is made from: the sample agrees with the view', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const sample = determinize(a.state, 0, createRng(seed));
      expect(JSON.parse(JSON.stringify(getView(sample, 0)))).toEqual(
        JSON.parse(JSON.stringify(getView(a.state, 0))),
      );
    }
  });

  test('a sample does not keep the real card of a face-down permanent of the other player (it is drawn again)', () => {
    const real = a.state.battlefield
      .map((id) => a.state.objects[id])
      .filter((o) => o?.faceDown !== undefined)
      .map((o) => o?.card);
    let differs = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const sample = determinize(a.state, 0, createRng(seed));
      const cards = sample.battlefield
        .map((id) => sample.objects[id])
        .filter((o) => o?.faceDown !== undefined)
        .map((o) => o?.card);
      expect(cards).toHaveLength(real.length);
      if (cards.some((c, i) => c !== real[i])) differs += 1;
    }
    // The pool is the owner's hidden cards (their hand, library and these two), so most samples deal at least one of the two face-down permanents another card.
    expect(differs).toBeGreaterThan(15);
  });

  test('the cards are revealed when the permanent leaves the battlefield (CR 708.9): then the events and the view name it', () => {
    const mark = a.mark();
    a.passAll();
    expect(a.find({ name: ALPHA.name, zone: 'graveyard' })).toHaveLength(1);
    const events = JSON.stringify(a.eventsSince(mark));
    expect(
      events.includes(JSON.stringify(a.object({ name: ALPHA.name, zone: 'graveyard' }).card)),
    ).toBe(true);
    expect(JSON.stringify(a.view(0)).includes(JSON.stringify(ALPHA.name))).toBe(true);
  });
});

// ---- The classification of every view field and every event kind.

type FieldClass = 'public' | 'masked' | 'controllerOnly';

/**
 * Every field of `ObjectView` and what it is for a face-down permanent: `public` (a characteristic or a fact the face-down permanent has: derived from layer 1b and the layers
 * after it, or public information of the game), `masked` (it would come from the card and is replaced for the viewers who may not look), `controllerOnly` (absent unless the
 * viewer controls it). Typed by the keys: a new field does not compile until it is classified here.
 */
const OBJECT_VIEW_FIELDS: Readonly<Record<keyof ObjectView, FieldClass>> = {
  id: 'public',
  owner: 'public',
  controller: 'public',
  zone: 'public',
  name: 'masked',
  manaCost: 'public',
  supertypes: 'public',
  types: 'public',
  subtypes: 'public',
  colors: 'public',
  power: 'public',
  toughness: 'public',
  oracleText: 'public',
  tapped: 'public',
  damage: 'public',
  counters: 'public',
  level: 'public',
  monstrous: 'public',
  isCommander: 'masked',
  summoningSick: 'public',
  controlEnds: 'public',
  ringBearer: 'public',
  pairedWith: 'public',
  pairedPhasedOut: 'public',
  wouldBeSummoningSick: 'public',
  printedPt: 'public',
  isToken: 'public',
  tokenDefinition: 'masked',
  printedLoyalty: 'public',
  loyaltyUsed: 'public',
  emblem: 'public',
  copy: 'public',
  keywords: 'public',
  restrictions: 'public',
  landwalks: 'public',
  protector: 'public',
  support: 'masked',
  targets: 'public',
  modes: 'public',
  modeTexts: 'public',
  abilitySource: 'public',
  triggerSubject: 'public',
  ability: 'public',
  activated: 'public',
  attachedTo: 'public',
  attachments: 'public',
  regenerationShields: 'public',
  kicked: 'public',
  kicks: 'public',
  replicated: 'public',
  flashback: 'public',
  free: 'public',
  alternative: 'public',
  alternativeCosts: 'public',
  specialActions: 'public',
  suspended: 'public',
  faceDown: 'public',
  faceDownBy: 'public',
  hiddenFace: 'controllerOnly',
  turnFaceUpCost: 'controllerOnly',
  ifFaceUp: 'controllerOnly',
  foretold: 'public',
  foretoldTurn: 'public',
  exiledFaceDown: 'public',
  x: 'public',
  chosen: 'public',
  castCost: 'public',
  additionalCosts: 'public',
  additionalCostChoice: 'public',
  face: 'masked',
  faces: 'masked',
  layout: 'masked',
  meld: 'masked',
  onAdventure: 'public',
  prepared: 'public',
  preparedSpell: 'public',
  finalChapter: 'public',
  chapter: 'public',
};

/** The fields of an event that hold a card (its id or its name). Typed by the kinds: a new kind does not compile until it is classified here. */
const EVENT_CARD_FIELDS: Readonly<Record<GameEvent['kind'], readonly string[]>> = {
  gameStarted: [],
  mulliganTaken: [],
  handKept: [],
  turnBegan: [],
  stepBegan: [],
  zoneChanged: ['card'],
  melded: ['cards'],
  meldFailed: [],
  manifested: [],
  pilesSeparated: ['first', 'second'],
  pileChosen: ['names'],
  turnedFaceUp: ['card'],
  cardDrawn: [],
  drewFromEmptyLibrary: [],
  drawSkipped: [],
  drawReplaced: [],
  libraryShuffled: [],
  dieRolled: [],
  milled: [],
  landPlayed: [],
  spellCast: [],
  spellCopied: [],
  targetChanged: [],
  abilityActivated: [],
  modesChosen: [],
  manaAdded: [],
  manaEmptied: [],
  tapped: [],
  tappedForMana: [],
  controlChanged: [],
  untapped: [],
  priorityPassed: [],
  attackersDeclared: [],
  blockersDeclared: [],
  removedFromCombat: [],
  cardsBottomed: [],
  regenerated: [],
  umbraArmorUsed: [],
  resolved: [],
  fizzled: [],
  countered: [],
  damageDealt: [],
  damagePrevented: [],
  damageRedirected: [],
  energyChanged: [],
  prepared: [],
  lifeChanged: [],
  lifeGained: [],
  poisonChanged: [],
  counterAdded: [],
  becameMonstrous: [],
  crimeCommitted: [],
  counterRemoved: [],
  died: ['card'],
  sacrificed: [],
  tokenCreated: ['name'],
  emblemCreated: [],
  abilityTriggered: [],
  abilityRemoved: [],
  permanentsChosen: [],
  proliferated: [],
  fought: [],
  becameTarget: [],
  legendRule: ['name'],
  librarySearched: [],
  topCardsLooked: [],
  scried: [],
  surveiled: [],
  cardsRevealed: ['cards', 'names'],
  optionalAnswered: [],
  replacementChosen: [],
  optionChosen: [],
  enteredAsCopy: [],
  discarded: [],
  cycled: [],
  madnessExiled: [],
  miracleRevealed: [],
  suspended: [],
  foretold: [],
  attached: [],
  unattached: [],
  commanderMovedToCommandZone: ['card'],
  playerLost: [],
  gameEnded: [],
  conceded: [],
  monarchChanged: [],
  citysBlessingGained: [],
  ringTempted: [],
  ringBearerLost: [],
  creaturesPaired: [],
  creaturesUnpaired: [],
};

describe('the classification of the view fields and the event kinds', () => {
  const g = build(ALPHA_WORLD);
  g.passAll();
  const downs = g.state.battlefield.filter((id) => g.state.objects[id]?.faceDown !== undefined);

  test('the view of a face-down permanent for the other seat holds exactly the public and masked fields, with the masked ones masked', () => {
    expect(downs.length).toBeGreaterThan(0);
    for (const id of downs) {
      const v = getView(g.state, 0).battlefield.find((o) => o.id === id);
      expect(v).toBeDefined();
      for (const key of Object.keys(v ?? {})) {
        expect(OBJECT_VIEW_FIELDS[key as keyof ObjectView], `${key} is classified`).toBeDefined();
        expect(
          OBJECT_VIEW_FIELDS[key as keyof ObjectView],
          `${key} is shown to the other seat`,
        ).not.toBe('controllerOnly');
      }
      expect(v).toMatchObject({
        faceDown: true,
        faceDownBy: 'manifest',
        types: ['creature'],
        subtypes: [],
        supertypes: [],
        colors: [],
        manaCost: null,
        oracleText: '',
        power: 2,
        toughness: 2,
        isCommander: false,
        support: 'supported',
        keywords: [],
      });
      expect(v?.name).toMatch(/^Face-down creature \d+$/);
      for (const key of [
        'faces',
        'layout',
        'meld',
        'face',
        'hiddenFace',
        'turnFaceUpCost',
        'ifFaceUp',
        'tokenDefinition',
      ]) {
        expect(v, key).not.toHaveProperty(key);
      }
    }
  });

  test('the controller sees the card of each face-down permanent, with the cost to turn it up', () => {
    for (const id of downs) {
      const v = getView(g.state, 1).battlefield.find((o) => o.id === id);
      expect(v?.faceDown).toBe(true);
      expect(v?.name).toMatch(/^Face-down creature \d+$/);
      expect([ALPHA.name, CHARLIE.name]).toContain(v?.hiddenFace?.name);
      expect(v?.turnFaceUpCost?.length).toBeGreaterThan(0);
      expect(v?.types).toEqual(['creature']);
      expect(v?.power).toBe(2);
    }
  });

  test('every event kind of the table that names a card names none that is face down: checked over the events of the flow', () => {
    const w = build(ALPHA_WORLD);
    const secretCards = new Set<string>();
    const all: GameEvent[] = [];
    flow(w);
    for (const e of w.events) all.push(e);
    for (const id of w.state.battlefield) {
      const o = w.state.objects[id];
      if (o?.faceDown !== undefined && o.card !== null) secretCards.add(o.card);
    }
    expect(secretCards.size).toBe(2);
    for (const e of all) {
      for (const field of EVENT_CARD_FIELDS[e.kind]) {
        const value = (e as unknown as Record<string, unknown>)[field];
        const cards = Array.isArray(value) ? value : [value];
        for (const c of cards) {
          expect(secretCards.has(c as string), `${e.kind}.${field} names a face-down card`).toBe(
            false,
          );
        }
      }
    }
    expect(all.some((e) => e.kind === 'zoneChanged' && e.card === null)).toBe(true);
  });
});

describe('a commander that is manifested (CR 903.3, 708.5)', () => {
  const COMMANDER = secret(
    'SYNTHETIC Secret Commander',
    '44444444-dddd-4ddd-8ddd-dddddddddddd',
    'Flying (commander secret text)',
    ['4', 'R'],
  );
  test('is not shown as a commander to the other seat, and is to its controller', () => {
    const g = scenario()
      .define(COMMANDER)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(SELF)
      .battlefield('Forest', { count: 4 })
      .library(COMMANDER.name, { commander: true })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast(SELF, { pay: true });
    g.passAll();
    const id = g.id({ name: COMMANDER.name, zone: 'battlefield' });
    const other = getView(g.state, 0).battlefield.find((o) => o.id === id) as ObjectView;
    const mine = getView(g.state, 1).battlefield.find((o) => o.id === id) as ObjectView;
    expect(other.isCommander).toBe(false);
    expect(mine.faceDown).toBe(true);
    expect(mine.isCommander).toBe(true);
    expect(JSON.stringify(getView(g.state, 0) satisfies GameView)).not.toContain(COMMANDER.name);
  });
});

describe('a double-faced card face down (CR 708.2, 712.8a)', () => {
  const DFC = 'SYNTHETIC Moon Cub // Moon Beast';
  test('shows the other seat no faces, no layout and no face; its controller sees the front face', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(DFC, { faceDown: true })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    const id = g.id({ name: DFC, zone: 'battlefield' });
    const other = getView(g.state, 0).battlefield.find((o) => o.id === id) as ObjectView;
    const mine = getView(g.state, 1).battlefield.find((o) => o.id === id) as ObjectView;
    for (const key of ['faces', 'layout', 'face', 'meld'])
      expect(other, key).not.toHaveProperty(key);
    for (const key of ['faces', 'layout', 'face']) expect(mine, key).not.toHaveProperty(key);
    expect(mine.hiddenFace?.name).toBe('Moon Cub');
    expect(JSON.stringify(getView(g.state, 0))).not.toContain('Moon');
  });
});
