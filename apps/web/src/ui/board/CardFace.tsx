/**
 * A card drawn as a CSS frame: name, mana cost, colour band, type line, rules text, P/T or
 * loyalty. This is the one seam where a Scryfall image replaces the frame once cards are matched
 * to Scryfall (docs/ROADMAP.md); callers pass an `ObjectView` and a variant and nothing else.
 *
 * The face drawn is the one that is up (`ObjectView.name`, `oracleText` and the rest are already its
 * values); the preview panel lists every face (`PreviewPanel.tsx`). Attached Auras and Equipment are not part of a frame: the board draws them as strips under the host's tile
 * (`Attached.tsx`) and the preview lists them (`PreviewPanel.tsx`). The corner power and toughness
 * is the view's derived number, which already includes counters, static bonuses and effects, so
 * nothing here adds anything to it.
 */
import type { ObjectView } from '@commander-arena/engine';
import { abilityTypeLine } from '../../game/activation';
import { alternativeBadge } from '../../game/alt-cost';
import { withAnnouncedX } from '../../game/amount-text';
import { designationKind, designationTypeLine, ringTemptedOf } from '../../game/designations';
import {
  exileMarks,
  FACE_DOWN_NAME,
  isHiddenFaceDown,
  timeCountersOn,
} from '../../game/later-text';
import { loreBadge, stackLabel } from '../../game/saga';
import {
  castCostChanged,
  costNowTitle,
  shownCost,
  withX,
  xCostTitle,
} from '../decisions/cast-cost';
import { isBackFaceUp } from '../decisions/layouts';
import { kickedWords, replicatedWords, typeLine } from '../format';
import { ManaCost } from '../mana';
import { useApp, useDefinedPt } from '../store-context';
import { Art, artOf } from './art';
import './later.css';
import { bandBackground, cornerStat, isCrewedVehicle, PRINTED_TITLE } from './resolve';

export type CardVariant = 'full' | 'hand';

export function SupportBadge({ object }: { object: ObjectView }) {
  if (object.support !== 'unsupported') return null;
  return (
    <span
      className="board-badge board-badge-warn"
      title="The engine does not fully understand this card. The text it does not know is ignored."
    >
      Unsupported
    </span>
  );
}

/**
 * "kicked" (CR 702.33d) on a spell on the stack and on the permanent that entered from one, and
 * "flashback" (CR 702.34a) on a spell cast from the graveyard, which is exiled when it leaves the
 * stack. Both come from the engine's view (`ObjectView.kicked`, `ObjectView.flashback`). "overloaded",
 * "evoked" and "dashed" (`ObjectView.alternative`, D-121) say which alternative cost a spell was cast
 * for; "evoked" and "dashed" stay on the permanent.
 */
export function CastBadges({ object }: { object: ObjectView }) {
  const alternative = alternativeBadge(object);
  return (
    <>
      {object.prepared === true && (
        <span
          className="board-badge board-badge-cast"
          title="Prepared: its controller may cast a copy of its prepare spell from exile (CR 722). It stops being prepared as the spell is cast."
        >
          prepared
        </span>
      )}
      {object.onAdventure === true && (
        <span
          className="board-badge board-badge-cast"
          title="This card resolved as an Adventure. Its owner may cast it from exile."
        >
          on an Adventure
        </span>
      )}
      {isBackFaceUp(object) && (
        <span className="board-badge board-badge-cast" title="The back face is up.">
          back face
        </span>
      )}
      {kickedWords(object) !== null && (
        <span
          className="board-badge board-badge-cast"
          title={
            object.kicks !== undefined && object.kicks > 1
              ? `The multikicker cost was paid ${object.kicks} times for this spell.`
              : 'The kicker cost was paid for this spell.'
          }
          data-kicks={object.kicks}
        >
          {kickedWords(object)}
        </span>
      )}
      {object.copy === true && (
        <span
          className="board-badge board-badge-cast"
          title="A copy of a spell (CR 707.10). It is not a card: it ceases to exist when it leaves the stack, or becomes a token if it is a permanent spell that resolves."
          data-copy
        >
          copy
        </span>
      )}
      {replicatedWords(object) !== null && (
        <span
          className="board-badge board-badge-cast"
          title="The replicate cost was paid for this spell (CR 702.56a)."
          data-replicated={object.replicated}
        >
          {replicatedWords(object)}
        </span>
      )}
      {object.x !== undefined && (
        <span
          className="board-badge board-badge-cast"
          title={`X was announced as ${object.x} as this was put on the stack.`}
          data-x={object.x}
        >
          X = {object.x}
        </span>
      )}
      {object.flashback === true && (
        <span
          className="board-badge board-badge-cast"
          title="Cast from the graveyard for its flashback cost. It is exiled when it leaves the stack."
        >
          flashback
        </span>
      )}
      {alternative !== null && (
        // Overload, Evoke and Dash (D-121): on the spell, and on the permanent that came from one.
        <span
          className="board-badge board-badge-cast"
          title={alternative.title}
          data-alternative={object.alternative}
        >
          {alternative.text}
        </span>
      )}
      {object.free === true && (
        <span
          className="board-badge board-badge-cast"
          title="Cast without paying its mana cost. Additional costs and commander tax were still paid."
        >
          free
        </span>
      )}
    </>
  );
}

/**
 * The mana cost in a card's head. A card in the hand or the command zone shows what casting it
 * costs now (`ObjectView.castCost`: commander tax and cost reductions included, D-095) when that
 * differs from the printed cost, highlighted, with the printed cost in its hover text; everything
 * else shows the printed cost. A cost reduced to nothing shows {0}.
 */
export function CostDisplay({ object }: { object: ObjectView }) {
  const title = costNowTitle(object);
  if (title === null) {
    // An {X} stays as printed in a hand; on the stack it is the cost paid for the X chosen.
    const paid = object.x !== undefined && object.manaCost !== null;
    const cost = paid ? withX(object.manaCost ?? [], object.x ?? 0) : object.manaCost;
    const hint = paid ? null : xCostTitle(object);
    return hint === null ? (
      <ManaCost cost={cost} />
    ) : (
      <span title={hint} data-cost-x>
        <ManaCost cost={cost} />
      </span>
    );
  }
  const cost = shownCost(object) ?? [];
  return (
    <span className="board-cost-now" title={title} data-cost-changed={castCostChanged(object)}>
      <ManaCost cost={cost.length === 0 ? ['0'] : cost} />
    </span>
  );
}

/**
 * "crewed" on a Vehicle that is a creature right now (CR 702.122a: until end of turn). An uncrewed
 * Vehicle shows its printed power and toughness greyed in the corner instead (`cornerStat`).
 */
export function CrewBadge({ object }: { object: ObjectView }) {
  if (!isCrewedVehicle(object)) return null;
  return (
    <span
      className="board-badge board-badge-cast"
      title="Crewed: this Vehicle is an artifact creature until end of turn."
    >
      crewed
    </span>
  );
}

/**
 * "Lore 1 / 3" on a Saga with chapter abilities (CR 714): its lore counters against its final
 * chapter number, both from the engine's view.
 */
export function LoreBadge({ object }: { object: ObjectView }) {
  const text = loreBadge(object);
  if (text === null) return null;
  return (
    <span
      className="board-badge board-badge-cast board-lore"
      title="Lore counters on this Saga, out of its final chapter number. It is sacrificed once its last chapter has resolved."
    >
      {text}
    </span>
  );
}

/**
 * "time 2" on a suspended card in exile (CR 702.62b) and "Foretold" on the viewer's own face-down card
 * (CR 702.143a), from `counters.time` and `foretold` (D-128).
 */
export function LaterBadges({ object }: { object: ObjectView }) {
  const marks = exileMarks(object);
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((mark) => (
        <span
          key={mark}
          className="board-badge board-badge-cast"
          data-exile-mark={mark}
          title={
            mark === 'Foretold'
              ? 'Foretold: face down in exile. Only you can look at it. From a later turn you may cast it for its foretell cost.'
              : mark === 'Hideaway'
                ? 'Hideaway: exiled face down. Only you can look at it, for as long as the permanent that exiled it stays on the battlefield.'
                : `Suspended: ${timeCountersOn(object)} time counters. One is removed at the beginning of its owner's upkeep; when the last is gone it is cast for free.`
          }
        >
          {mark}
        </span>
      ))}
    </>
  );
}

export function CommanderMark({ object }: { object: ObjectView }) {
  if (!object.isCommander) return null;
  return (
    <span className="board-badge board-badge-cmdr" title="Commander">
      CMDR
    </span>
  );
}

export function CardFace({
  object,
  variant,
  activated = false,
}: {
  object: ObjectView;
  variant: CardVariant;
  /** For an ability on the stack: true when it was activated rather than triggered. */
  activated?: boolean;
}) {
  const defined = useDefinedPt(object.id);
  const stat = cornerStat(object, defined);
  const art = artOf(object);
  // D-243: the monarch and the Ring (small cards of the emblem strip) have a type line of their own.
  const designation = designationKind(object.id);
  const ringTempted = useApp((s) =>
    designation === 'ring' && s.snapshot !== null
      ? ringTemptedOf(s.snapshot.view, object.owner)
      : 0,
  );
  // The other player's foretold card (CR 702.143a): a card back with no name, no cost, no art lookup.
  if (isHiddenFaceDown(object)) {
    return (
      <div
        className={`board-card board-card-${variant} board-card-facedown`}
        data-face-down
        role="img"
        aria-label={`${FACE_DOWN_NAME} (face down)`}
      >
        <span className="board-card-name">{FACE_DOWN_NAME}</span>
        <span className="board-badge board-badge-cast">face down</span>
      </div>
    );
  }
  // Issue 107: on the stack, the X announced for it is written where the text says X.
  const text =
    object.zone === 'stack' && object.x !== undefined
      ? withAnnouncedX(object.oracleText, object.x)
      : object.oracleText;
  const paragraphs = text === '' ? [] : text.split('\n');
  return (
    <div className={`board-card board-card-${variant}${object.isToken ? ' board-card-token' : ''}`}>
      {variant === 'full' && (
        // The complete card with its artist credit (Scryfall guidelines, A19). The drawn frame
        // below stays for assistive technology and as the fallback when the image is missing.
        <Art
          name={art.name}
          back={art.back}
          isToken={object.isToken || object.emblem === true}
          version="normal"
          className="board-card-image"
        />
      )}
      <div className="board-card-head">
        <span className="board-card-name">{stackLabel(object)}</span>
        <CostDisplay object={object} />
      </div>
      <div className="board-card-art" style={{ background: bandBackground(object.colors) }}>
        <Art
          name={art.name}
          back={art.back}
          isToken={object.isToken || object.emblem === true}
          version="art_crop"
          className="board-card-art-img"
        />
      </div>
      <div className="board-card-type">
        {object.abilitySource !== undefined
          ? abilityTypeLine(activated)
          : designation !== null
            ? designationTypeLine(designation, ringTempted)
            : object.emblem === true
              ? 'Emblem'
              : `${object.isToken ? 'Token ' : ''}${typeLine(object)}`}
      </div>
      {variant === 'full' && (
        <div className="board-card-text">
          {paragraphs.length === 0 ? (
            <p className="board-card-vanilla">No rules text.</p>
          ) : (
            paragraphs.map((p, i) => (
              // Paragraphs of one card never reorder; the position is the identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: static text lines
              <p key={i}>{p}</p>
            ))
          )}
        </div>
      )}
      <div className="board-card-foot">
        <span className="board-card-marks">
          <CommanderMark object={object} />
          <CastBadges object={object} />
          <LaterBadges object={object} />
          <CrewBadge object={object} />
          <LoreBadge object={object} />
          <SupportBadge object={object} />
        </span>
        {stat !== null && (
          <span
            className={`board-stat board-stat-${stat.kind}`}
            title={stat.title ?? (stat.kind === 'printed' ? PRINTED_TITLE : undefined)}
          >
            {stat.kind === 'loyalty' ? `Loyalty ${stat.text}` : null}
            {stat.kind === 'defense' ? `Defense ${stat.text}` : null}
            {stat.kind === 'pt' || stat.kind === 'printed' ? stat.text : null}
          </span>
        )}
      </div>
    </div>
  );
}
