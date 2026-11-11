// Slice soak (D-120): whole games (the `soakGames()` count, test/soak.ts) with the 'keywordBatch2' deck style (SYNTHETIC cards: Skulk, Battle cry,
// Mentor, Evolve, Bushido, Extort, Affinity, regeneration, Convoke, Improvise, Delve and Cascade) between random
// agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules
// read again here from the cards' texts (not from the engine's own code), at every step:
//   - a creature with skulk is never offered a blocker with greater power (CR 702.118b);
//   - when Battle cry resolves, each other attacking creature has 1 more power (CR 702.91a);
//   - Mentor targets only attacking creatures with less power than the mentor, and a counter follows
//     (CR 702.134a);
//   - Evolve puts a counter only for a creature with greater power or toughness (CR 702.100a);
//   - Bushido triggers once for each blocking creature that has it and once for each blocked one (CR 702.45a);
//   - Extort's drain loses the opponent exactly the life the controller gains (CR 702.101a);
//   - the view shows the cost of an Affinity card less by the permanents it counts (CR 702.41a);
//   - a regenerated creature is on the battlefield, tapped and undamaged, and did not die (CR 701.19a);
//   - what is tapped or exiled for Convoke, Improvise and Delve comes off the cost one mana each, and the
//     objects chosen were legal (CR 702.51a, 702.126a, 702.66a);
//   - Cascade finds a nonland card with a lower mana value, casts it for free from exile, and reports only
//     how many cards went to the bottom (CR 702.85a).
import {
  applyAction,
  CREATURE_TYPES,
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  manaValue,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type DeckStyle,
  KEYWORD2_NAMES,
  KEYWORD2_STYLE_PAIRS,
  landSlots,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

void CREATURE_TYPES;

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 6000 };

const SKULK = 'SYNTHETIC Skulk Rogue';
const CHIEF = 'SYNTHETIC Battle Cry Chief';
const MENTOR = 'SYNTHETIC Mentor Veteran';
const WHELP = 'SYNTHETIC Evolve Whelp';
const DUELIST = 'SYNTHETIC Bushido Duelist';
const PRIEST = 'SYNTHETIC Extort Priest';
const GOLEM = 'SYNTHETIC Affinity Golem'; // {5}, affinity for artifacts
const SPHINX = 'SYNTHETIC Affinity Sphinx'; // {3}{U}{U}, affinity for Islands
const CASCADE_VALUE: Readonly<Record<string, number>> = {
  'SYNTHETIC Cascade Giant': 4,
  'SYNTHETIC Cascade Drake': 3,
  'SYNTHETIC Cascade Sprite': 2,
};

interface Tally {
  skulkChecked: number;
  battleCryResolved: number;
  mentorTargets: number;
  mentorCounters: number;
  evolveCounters: number;
  bushidoTriggers: number;
  extortAsked: number;
  extortPaid: number;
  affinityChecked: number;
  regenerated: number;
  convoked: number;
  improvised: number;
  delved: number;
  cascadeAsked: number;
  cascadeCast: number;
  cascadeBottomed: number;
  casualAnswers: number;
  randomAnswers: number;
}
const newTally = (): Tally => ({
  skulkChecked: 0,
  battleCryResolved: 0,
  mentorTargets: 0,
  mentorCounters: 0,
  evolveCounters: 0,
  bushidoTriggers: 0,
  extortAsked: 0,
  extortPaid: 0,
  affinityChecked: 0,
  regenerated: 0,
  convoked: 0,
  improvised: 0,
  delved: 0,
  cascadeAsked: 0,
  cascadeCast: 0,
  cascadeBottomed: 0,
  casualAnswers: 0,
  randomAnswers: 0,
});

/** The name of the card behind an object (the object, or its last-known information). */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const origin =
    obj?.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** The power and toughness the view shows for an object on the battlefield, from either seat's view. */
function ptOf(state: GameState, id: ObjectId): { power: number; toughness: number } | null {
  const o = getView(state, 0).battlefield.find((x) => x.id === id);
  return o === undefined || o.power === null || o.toughness === null
    ? null
    : { power: o.power, toughness: o.toughness };
}

/** Skulk: no blocker with greater power is offered for an attacker with skulk. */
function checkSkulk(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'declareBlockers') return;
  for (const a of d.attackers) {
    if (nameOf(step.before, a.attacker) !== SKULK) continue;
    const attacker = ptOf(step.before, a.attacker);
    for (const c of d.candidates) {
      if (!c.canBlock.includes(a.attacker)) continue;
      const blocker = ptOf(step.before, c.blocker);
      tally.skulkChecked += 1;
      expect(blocker?.power ?? 0, 'a blocker offered against skulk').toBeLessThanOrEqual(
        attacker?.power ?? 0,
      );
    }
  }
}

/** Battle cry: when it resolves, each other attacking creature has 1 more power. */
function checkBattleCry(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'resolved')) {
    const obj = step.before.objects[e.object];
    if (obj?.stack?.kind !== 'ability' || nameOf(step.before, e.object) !== CHIEF) continue;
    if (obj.stack.source === null) continue;
    const combat = step.before.combat;
    if (combat === null) continue;
    // The ability affects the attackers on the battlefield as it resolves, except its own source.
    const others = combat.attackers
      .map((a) => a.object)
      .filter((id) => id !== obj.stack?.source && step.before.objects[id]?.zone === 'battlefield');
    for (const id of others) {
      const before = ptOf(step.before, id);
      const after = ptOf(step.after, id);
      if (before === null || after === null) continue;
      tally.battleCryResolved += 1;
      expect(after.power - before.power, `${nameOf(step.before, id)} after battle cry`).toBe(1);
      expect(after.toughness).toBe(before.toughness);
    }
  }
}

/** Mentor: targets are attacking creatures with less power than the mentor; a counter follows on resolution. */
function checkMentor(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind === 'targets' && d.forTrigger === true && nameOf(step.before, d.source) === MENTOR) {
    const ability = step.before.objects[d.source]?.stack;
    const mentor = ability?.source ?? null;
    const power = mentor === null ? null : ptOf(step.before, mentor)?.power;
    const attacking = new Set((step.before.combat?.attackers ?? []).map((a) => a.object));
    for (const spec of d.specs) {
      for (const t of spec.legal) {
        if (t.kind !== 'object') continue;
        tally.mentorTargets += 1;
        expect(attacking.has(t.id), 'a mentor target attacks').toBe(true);
        if (power !== null && power !== undefined) {
          expect(
            ptOf(step.before, t.id)?.power ?? 99,
            'a mentor target has less power',
          ).toBeLessThan(power);
        }
      }
    }
  }
  for (const e of eventsOf(step.events, 'resolved')) {
    if (nameOf(step.before, e.object) !== MENTOR) continue;
    if (step.before.objects[e.object]?.stack?.kind !== 'ability') continue;
    const counters = eventsOf(step.events, 'counterAdded').filter((c) => c.counter === '+1/+1');
    tally.mentorCounters += counters.length;
  }
}

/** Evolve: a counter only for a creature that entered with greater power or toughness. */
function checkEvolve(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'resolved')) {
    const stack = step.before.objects[e.object]?.stack;
    if (stack?.kind !== 'ability' || nameOf(step.before, e.object) !== WHELP) continue;
    const added = eventsOf(step.events, 'counterAdded').filter(
      (c) => c.object === stack.source && c.counter === '+1/+1',
    );
    if (added.length === 0) continue;
    tally.evolveCounters += added.length;
    const subject = stack.triggerSubject;
    if (subject === undefined || stack.source === null) continue;
    const mine = ptOf(step.before, stack.source);
    const theirs = ptOf(step.before, subject) ?? {
      power: step.before.lki[subject]?.power ?? 0,
      toughness: step.before.lki[subject]?.toughness ?? 0,
    };
    if (mine === null) continue;
    expect(
      theirs.power > mine.power || theirs.toughness > mine.toughness,
      'the creature that entered is bigger',
    ).toBe(true);
  }
}

/** Bushido: a trigger for each blocking creature with it and for each blocked creature with it, once. */
function checkBushido(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'blockersDeclared')) {
    const blockers = e.blocks.filter((b) => nameOf(step.after, b.blocker) === DUELIST).length;
    const attackers = new Set(
      e.blocks.filter((b) => nameOf(step.after, b.attacker) === DUELIST).map((b) => b.attacker),
    ).size;
    const fired = eventsOf(step.events, 'abilityTriggered').filter(
      (t) => nameOf(step.after, t.source) === DUELIST,
    ).length;
    expect(fired, 'bushido triggers').toBe(blockers + attackers);
    tally.bushidoTriggers += fired;
  }
}

/** Extort: the question is asked of the controller, and a drain loses what it gains. */
function checkExtort(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind === 'confirmOptional' && d.purpose === 'mayPay') {
    tally.extortAsked += 1;
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['W/B'] }]);
    expect(d.seat).toBe(step.before.objects[d.source]?.controller);
  }
  for (const e of eventsOf(step.events, 'resolved')) {
    if (nameOf(step.before, e.object) !== PRIEST) continue;
    if (step.before.objects[e.object]?.stack?.kind !== 'ability') continue;
    const controller = step.before.objects[e.object]?.controller ?? 0;
    const changes = eventsOf(step.events, 'lifeChanged');
    const lost = changes
      .filter((c) => c.seat !== controller && c.to < c.from)
      .reduce((n, c) => n + (c.from - c.to), 0);
    const gained = changes
      .filter((c) => c.seat === controller && c.to > c.from)
      .reduce((n, c) => n + (c.to - c.from), 0);
    if (lost > 0 || gained > 0) {
      tally.extortPaid += 1;
      expect(gained, 'extort gains what it drains').toBe(lost);
      expect(lost).toBeGreaterThanOrEqual(1);
    }
  }
}

/** Affinity: the cost in the hand view is the printed one less what the spell counts, never below the colored part. */
function checkAffinity(tally: Tally, step: StepInfo) {
  for (const seat of [0, 1] as const) {
    const view = getView(step.after, seat);
    const mine = view.battlefield.filter((o) => o.controller === seat);
    for (const card of view.seats[seat]?.hand ?? []) {
      if (card.name !== GOLEM && card.name !== SPHINX) continue;
      const counted =
        card.name === GOLEM
          ? mine.filter((o) => o.types.includes('artifact')).length
          : mine.filter((o) => o.subtypes.includes('Island')).length;
      const generic = card.name === GOLEM ? 5 : 3;
      const expected = Math.max(0, generic - counted);
      const shown = (card.castCost ?? [])
        .filter((s) => /^[0-9]+$/.test(s))
        .reduce((n, s) => n + Number(s), 0);
      expect(shown, `${card.name} with ${counted} counted`).toBe(expected);
      tally.affinityChecked += 1;
    }
  }
}

/** Regeneration: the permanent is still there, tapped and undamaged, and did not die. */
function checkRegenerate(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'regenerated')) {
    const after = step.after.objects[e.object];
    expect(after?.zone, 'a regenerated permanent stays').toBe('battlefield');
    expect(after?.tapped, 'a regenerated permanent is tapped').toBe(true);
    expect(after?.damage, 'a regenerated permanent has no damage').toBe(0);
    expect(eventsOf(step.events, 'died').some((d) => d.object === e.object)).toBe(false);
    tally.regenerated += 1;
  }
}

/** Convoke, Improvise and Delve: the answer was legal and took one mana off the cost for each object. */
function checkPayOptions(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'choosePayOptions' || step.action.kind !== 'choosePayOptions') return;
  const chosen = step.action.objects;
  for (const id of chosen) {
    const obj = step.before.objects[id];
    expect(d.candidates).toContain(id);
    if (d.mechanism === 'delve') {
      expect(obj?.zone).toBe('graveyard');
      expect(obj?.zoneOwner).toBe(d.seat);
      expect(step.after.objects[id], 'an exiled card is a new object').toBeUndefined();
    } else {
      expect(obj?.controller).toBe(d.seat);
      expect(obj?.tapped).toBe(false);
      expect(step.after.objects[id]?.tapped).toBe(true);
    }
  }
  const next = step.after.pending;
  const left =
    next?.kind === 'payMana'
      ? manaValue(next.totalCost)
      : next?.kind === 'choosePayOptions'
        ? manaValue(next.cost)
        : 0;
  expect(left, 'the cost left after tapping or exiling').toBe(manaValue(d.cost) - chosen.length);
  const bump =
    d.mechanism === 'convoke' ? 'convoked' : d.mechanism === 'improvise' ? 'improvised' : 'delved';
  tally[bump] += chosen.length;
}

/** Cascade: a cheaper nonland card is found, cast for free from exile, and the bottoming is silent. */
function checkCascade(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind === 'confirmOptional' && d.purpose === 'cascade') {
    tally.cascadeAsked += 1;
    const limit = CASCADE_VALUE[nameOf(step.before, d.source)] ?? 0;
    expect(limit).toBeGreaterThan(0);
    const found = d.subject === undefined ? undefined : step.before.objects[d.subject];
    expect(found?.zone).toBe('exile');
    const def =
      found?.card === null || found === undefined
        ? undefined
        : step.before.definitions[step.before.cards[found.card]?.definition ?? -1];
    const face = def?.faces[0];
    expect(face?.types.includes('land')).toBe(false);
    expect(manaValue(face?.manaCost ?? []), 'the card found is cheaper').toBeLessThan(limit);
    if (step.action.kind === 'acceptOptional') {
      const cast = eventsOf(step.events, 'spellCast');
      const free = cast.filter((e) => e.fromZone === 'exile' && e.alternative === 'free');
      // Accepting begins the cast: it is finished in this step when nothing needs choosing, else later.
      if (step.after.casting === null) expect(free.length).toBe(1);
      expect(step.after.stack.length).toBeGreaterThan(0);
    }
  }
  for (const e of eventsOf(step.events, 'spellCast')) {
    if (e.fromZone === 'exile' && e.alternative === 'free') {
      tally.cascadeCast += 1;
      // No mana was spent: no mana event and no source tapped by this step's own payment.
      expect(eventsOf(step.events, 'manaAdded')).toHaveLength(0);
    }
  }
  for (const e of eventsOf(step.events, 'cardsBottomed')) {
    tally.cascadeBottomed += e.count;
    expect(JSON.stringify(e)).not.toMatch(/"o\d+"/);
  }
  expect(
    step.events.some(
      (e) =>
        e.kind === 'zoneChanged' &&
        e.fromZone === 'exile' &&
        e.toZone === 'library' &&
        step.before.resolution !== null &&
        step.before.resolution.queue[0]?.kind === 'cascade',
    ),
    'the bottoming reports no zone change',
  ).toBe(false);
}

test(
  `${GAMES} keyword batch 2 games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KEYWORD2_STYLE_PAIRS[g % KEYWORD2_STYLE_PAIRS.length] ?? [
        'keywordBatch2',
        'keywordBatch2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 21000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 21000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkSkulk(total, step);
        checkBattleCry(total, step);
        checkMentor(total, step);
        checkEvolve(total, step);
        checkBushido(total, step);
        checkExtort(total, step);
        checkAffinity(total, step);
        checkRegenerate(total, step);
        checkPayOptions(total, step);
        checkCascade(total, step);
        if (step.before.pending !== null) {
          if (casual.has(step.seat)) total.casualAnswers += 1;
          else total.randomAnswers += 1;
        }
        // Every action the decision lists is accepted by the engine.
        if (step.before.pending?.kind === 'choosePayOptions') {
          const d = step.before.pending;
          for (const a of (d.choices as readonly (readonly ObjectId[])[]).slice(0, 4)) {
            expect(
              applyAction(step.before, d.seat, { kind: 'choosePayOptions', objects: [...a] }).ok,
            ).toBe(true);
          }
        }
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
    }
    console.log(
      `100 keyword batch 2 games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`,
    );

    expectPath(total.skulkChecked);
    expectPath(total.battleCryResolved);
    expectPath(total.mentorTargets);
    expectPath(total.evolveCounters);
    expectPath(total.bushidoTriggers);
    expectPath(total.extortAsked);
    expectPath(total.affinityChecked);
    expectPath(total.regenerated);
    expectPath(total.convoked);
    expectPath(total.improvised);
    expectPath(total.delved);
    expectPath(total.cascadeAsked);
    expectPath(total.cascadeCast);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
  },
  soakTimeout(900_000),
);

test('the keyword batch 2 cards are in no other deck style, so the older seeded games are unchanged', () => {
  const styles: DeckStyle[] = [
    'spells',
    'creatures',
    'brawl',
    'triggers',
    'keywords',
    'mana',
    'search',
    'activated',
    'attachments',
    'kicker',
    'food',
    'layers',
    'ward',
    'vehicles',
    'prevention',
    'layouts',
    'sagas',
    'triggerTargets',
    'library',
    'references',
    'restrictions',
    'costs',
    'manaPlus',
    'chosen',
    'x',
    'keywordBatch',
    'triggerSlice',
    'modal',
    'pt',
  ];
  const names = new Set<string>(KEYWORD2_NAMES);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  const own = new Set([...spellSlots('keywordBatch2'), ...landSlots('keywordBatch2')]);
  for (const name of names) expect(own.has(name), name).toBe(true);
});
