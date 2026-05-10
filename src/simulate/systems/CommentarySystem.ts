/**
 * CommentarySystem — 7.3
 *
 * Replaces flat event descriptions ("Müller passes to Schmidt")
 * with context-aware commentary that reacts to:
 *   - Chain phase (build_up, chance_creation, final_third)
 *   - Tactical phase (transition_attack, high_press, low_block etc.)
 *   - Momentum state (confidence spike, shock)
 *   - xG value (quality of chance)
 *   - Score context (desperate, protecting lead)
 *   - Time (last-minute heroics, etc.)
 *
 * Exported as a pure function — no system class needed.
 * Called by PassingSystem, ShootingSystem, TackleSystem, RefereeSystem
 * when building MatchEvent descriptions.
 */

import type { TeamTacticalPhase } from "../types";
import type { TempoModifier } from "./MatchRhythmSystem";

// ── Utility ──────────────────────────────────────────────

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Context bag passed to commentary functions ────────────

export interface CommentaryContext {
    minute: number;
    tacticalPhase?: TeamTacticalPhase;
    rhythmState?: TempoModifier["state"];
    chainPhase?: "build_up" | "chance_creation" | "final_third" | null;
    xg?: number;
    scoreDiff?: number; // own - opp
    playerName?: string;
    targetName?: string;
    isOnTarget?: boolean;
}

// ── SHOT descriptions ─────────────────────────────────────

export function commentaryShot(ctx: CommentaryContext): string {
    const { xg = 0, minute, scoreDiff = 0, playerName = "Player", isOnTarget } = ctx;

    const quality = xg >= 0.5 ? "high" : xg >= 0.2 ? "medium" : "low";
    const isLate = minute >= 80;
    const isDesperate = scoreDiff < -1 && isLate;
    const isProtecting = scoreDiff >= 1 && isLate;

    if (isDesperate) {
        return pick([
            `${playerName} tries his luck — they need a goal desperately!`,
            `Desperate attempt from ${playerName} as the clock ticks down!`,
            `${playerName} goes for goal — anything could happen now!`,
        ]);
    }

    if (quality === "high" && isOnTarget) {
        return pick([
            `${playerName} gets a clear sight of goal — excellent chance!`,
            `What a chance for ${playerName}! The keeper has to deal with this one.`,
            `${playerName} pulls the trigger — dangerous!`,
        ]);
    }

    if (quality === "high" && !isOnTarget) {
        return pick([
            `${playerName} should have done better there — blazes it wide!`,
            `Huge chance wasted! ${playerName} sends it wide of the post.`,
            `${playerName} gets his shot away but it's off-target — he'll be disappointed.`,
        ]);
    }

    if (quality === "medium" && isOnTarget) {
        return pick([
            `${playerName} tests the keeper from range.`,
            `Shot from ${playerName} — the goalkeeper has to work for this one.`,
            `${playerName} tries his luck — straight at the keeper.`,
        ]);
    }

    if (quality === "medium" && !isOnTarget) {
        return pick([
            `${playerName} shoots but it's off-target.`,
            `${playerName} has a go — just wide.`,
            `Attempt from ${playerName} — not the best connection.`,
        ]);
    }

    if (isProtecting) {
        return pick([
            `${playerName} fires on the counter — they'll take any goal now to seal it!`,
            `Quick shot from ${playerName} as they look to put the game to bed.`,
        ]);
    }

    // Low quality
    return pick([
        `${playerName} tries from distance — well off target.`,
        `Speculative effort from ${playerName} — never really troubling the keeper.`,
        `${playerName} has a go — optimistic.`,
    ]);
}

// ── GOAL descriptions ─────────────────────────────────────

export function commentaryGoal(ctx: CommentaryContext): string {
    const { minute, scoreDiff = 0, playerName = "Player", xg = 0 } = ctx;
    const isLateDramatic = minute >= 85;
    const isLowXG = xg < 0.1;
    const isHighXG = xg >= 0.5;
    const isLeveller = scoreDiff === 0; // after scoring, diff becomes 0 if was -1
    const isDesperate = scoreDiff < 0;

    if (isLateDramatic && isDesperate) {
        return pick([
            `INCREDIBLE! ${playerName} scores in injury time — this could change everything!`,
            `Last-gasp goal from ${playerName}! The crowd goes absolutely wild!`,
            `${playerName} with the dramatic late equaliser! What a match!`,
        ]);
    }

    if (isLateDramatic) {
        return pick([
            `${playerName} makes it safe in the dying minutes! That should seal it!`,
            `Late goal from ${playerName} — this game is over now!`,
            `${playerName} puts the icing on the cake! Clinical finish!`,
        ]);
    }

    if (isLowXG) {
        return pick([
            `${playerName} scores against the run of play — the keeper will be furious with himself!`,
            `Brilliant finish from ${playerName} — that was a difficult chance and he took it superbly!`,
            `Against the odds, ${playerName} finds the net from a tight angle!`,
        ]);
    }

    if (isHighXG) {
        return pick([
            `${playerName} makes no mistake — had to score from there!`,
            `Clinical finish from ${playerName}! You don't miss chances like that at this level.`,
            `${playerName} converts the chance — exactly what you'd expect from that position.`,
        ]);
    }

    if (isLeveller) {
        return pick([
            `${playerName} levels it up! All square again!`,
            `They're level now — ${playerName} with the equaliser!`,
            `${playerName} drags them back into it! Game on!`,
        ]);
    }

    return pick([
        `${playerName} scores! The team erupts — brilliant finish!`,
        `Goal! ${playerName} finds the net — excellent strike!`,
        `${playerName} puts it away! That's a well-taken goal!`,
    ]);
}

// ── SAVE descriptions ─────────────────────────────────────

export function commentarySave(ctx: CommentaryContext): string {
    const { xg = 0, playerName = "Player", targetName = "keeper" } = ctx;
    const quality = xg >= 0.5 ? "high" : xg >= 0.25 ? "medium" : "low";

    if (quality === "high") {
        return pick([
            `What a save by ${targetName}! That had goal written all over it!`,
            `Incredible stop from ${targetName} — ${playerName} cannot believe it!`,
            `${targetName} to the rescue! Brilliant reflex save to deny ${playerName}!`,
        ]);
    }

    if (quality === "medium") {
        return pick([
            `Good save by ${targetName} — beats away ${playerName}'s effort.`,
            `${targetName} down well to stop ${playerName}'s shot.`,
            `The keeper gets a strong hand to ${playerName}'s strike — well done!`,
        ]);
    }

    return pick([
        `${targetName} claims it comfortably.`,
        `No trouble for ${targetName} there — straight at him.`,
        `${playerName} fires but ${targetName} smothers it easily.`,
    ]);
}

// ── TACKLE / INTERCEPTION descriptions ────────────────────

export function commentaryTackle(ctx: CommentaryContext): string {
    const { playerName = "Player", tacticalPhase } = ctx;

    if (tacticalPhase === "transition_defend") {
        return pick([
            `Great recovery tackle from ${playerName} — stops the counter!`,
            `${playerName} with a vital challenge — tracking back brilliantly!`,
            `Superb defensive work from ${playerName} — kills the break!`,
        ]);
    }

    return pick([
        `${playerName} wins the ball — excellent challenge!`,
        `Good tackle from ${playerName} — cleanly won!`,
        `${playerName} dispossesses his man — reading the game well.`,
    ]);
}

export function commentaryInterception(ctx: CommentaryContext): string {
    const { playerName = "Player", chainPhase } = ctx;

    if (chainPhase === "final_third") {
        return pick([
            `${playerName} intercepts in a dangerous area — crucial!`,
            `Brilliant read by ${playerName} — cuts out that pass completely!`,
        ]);
    }

    return pick([
        `${playerName} reads the pass and intercepts!`,
        `Smart positioning from ${playerName} — cuts out the through ball.`,
        `${playerName} steps in — great anticipation.`,
    ]);
}

// ── PASS descriptions (for key passes only) ───────────────

export function commentaryKeyPass(ctx: CommentaryContext): string {
    const { playerName = "Player", targetName = "teammate", chainPhase } = ctx;

    if (chainPhase === "chance_creation" || chainPhase === "final_third") {
        return pick([
            `Brilliant through ball from ${playerName} to find ${targetName}!`,
            `Delicious pass by ${playerName} — ${targetName} in on goal!`,
            `Inch-perfect delivery from ${playerName}!`,
        ]);
    }

    return pick([
        `${playerName} plays it to ${targetName}.`,
        `${playerName} finds ${targetName} with a neat pass.`,
        `Good ball from ${playerName} into ${targetName}.`,
    ]);
}

// ── CORNER descriptions ────────────────────────────────────

export function commentaryCorner(ctx: CommentaryContext): string {
    const { minute, scoreDiff = 0 } = ctx;
    const isLate = minute >= 80;
    const isChasing = scoreDiff < 0;

    if (isLate && isChasing) {
        return pick([
            `Corner kick — all hands on deck as they go long again!`,
            `Another set piece — they need something from this one!`,
        ]);
    }

    return pick([
        `Corner kick.`,
        `Ball goes out for a corner.`,
        `Corner won — dangerous delivery expected.`,
    ]);
}

// ── FOUL / FREEKICK descriptions ──────────────────────────

export function commentaryFreeKick(ctx: CommentaryContext): string {
    const { playerName = "Player", minute } = ctx;
    const isLate = minute >= 75;

    if (isLate) {
        return pick([
            `Foul by ${playerName} — dangerous position for the free kick at this stage of the game.`,
            `${playerName} gives it away late on — costly?`,
        ]);
    }

    return pick([
        `Foul from ${playerName}. Free kick awarded.`,
        `${playerName} caught for the tackle — referee blows.`,
        `Free kick in a promising position.`,
    ]);
}
