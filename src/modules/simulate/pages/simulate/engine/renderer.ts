// ============================================================
// RENDERER — Canvas 2D top-down football field renderer
// ============================================================

import type { Ball, Team, MatchState, FieldDimensions, RenderOptions } from "./types";
import { PHYSICS, distVec } from "./physics";

// ── Render Colors ─────────────────────────────────────────
const COLORS = {
    fieldGreen:    "#2d5a1b",
    fieldStripe1:  "#2d5a1b",
    fieldStripe2:  "#265218",
    lineWhite:     "rgba(255,255,255,0.85)",
    goalPost:      "#ffffff",
    goalNet:       "rgba(255,255,255,0.25)",
    ballMain:      "#f5f0e8",
    ballPanel:     "#1a1a1a",
    shadow:        "rgba(0,0,0,0.35)",
    goalFlash:     "rgba(255,220,50,0.45)",
    eventText:     "#ffffff",
};

interface PlayerAnimState {
    legPhase: number;
    prevX: number;
    prevY: number;
}

// ── Renderer class ────────────────────────────────────────
export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private playerAnimStates: Map<string, PlayerAnimState> = new Map();
    private goalFlashTimer = 0;

    constructor(private canvas: HTMLCanvasElement, private field: FieldDimensions) {
        this.ctx = canvas.getContext("2d")!;
    }

    triggerGoalFlash() { this.goalFlashTimer = 60; }

    render(homeTeam: Team, awayTeam: Team, ball: Ball, state: MatchState, opts: RenderOptions): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Scale canvas
        const scaleX = this.canvas.width / fw;
        const scaleY = this.canvas.height / fh;
        ctx.save();
        ctx.scale(scaleX, scaleY);

        this._drawField();
        this._drawGoals();

        // Goal flash
        if (this.goalFlashTimer > 0) {
            ctx.fillStyle = COLORS.goalFlash;
            ctx.fillRect(0, 0, fw, fh);
            this.goalFlashTimer--;
        }

        // Draw players
        for (const player of [...homeTeam.players, ...awayTeam.players]) {
            const teamColor = player.team === "home" ? homeTeam.color : awayTeam.color;
            const secColor = player.team === "home" ? homeTeam.secondaryColor : awayTeam.secondaryColor;
            this._drawPlayer(player, teamColor, secColor, opts.showNames);
        }

        // Draw ball
        this._drawBall(ball);

        // Draw possession indicator
        if (opts.showPossessionArrow) {
            this._drawPossessionIndicator(homeTeam, awayTeam, ball);
        }

        ctx.restore();
    }

    // ── Field ───────────────────────────────────────────────
    private _drawField(): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const stripeW = 60;

        // Base green
        ctx.fillStyle = COLORS.fieldGreen;
        ctx.fillRect(0, 0, fw, fh);

        // Alternating stripes
        for (let x = 0; x < fw; x += stripeW * 2) {
            ctx.fillStyle = COLORS.fieldStripe2;
            ctx.fillRect(x, 0, stripeW, fh);
        }

        ctx.strokeStyle = COLORS.lineWhite;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        // Outline
        ctx.strokeRect(2, 2, fw - 4, fh - 4);

        // Halfway line
        ctx.beginPath();
        ctx.moveTo(fw / 2, 2);
        ctx.lineTo(fw / 2, fh - 2);
        ctx.stroke();

        // Center circle
        ctx.beginPath();
        ctx.arc(fw / 2, fh / 2, this.field.centerCircleRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(fw / 2, fh / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.lineWhite;
        ctx.fill();

        this._drawPenaltyArea("left");
        this._drawPenaltyArea("right");
        this._drawCornerArcs();
    }

    private _drawPenaltyArea(side: "left" | "right"): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const pw = this.field.penaltyAreaWidth;
        const ph = this.field.penaltyAreaHeight;
        const cx = fh / 2;

        const x = side === "left" ? 0 : fw - pw;
        const y = cx - ph / 2;

        ctx.strokeStyle = COLORS.lineWhite;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, pw, ph);

        // Small box (6-yard box)
        const sbw = 40;
        const sbh = this.field.goalWidth + 30;
        const sx = side === "left" ? 0 : fw - sbw;
        const sy = cx - sbh / 2;
        ctx.strokeRect(sx, sy, sbw, sbh);

        // Penalty spot
        const spotX = side === "left" ? 80 : fw - 80;
        ctx.beginPath();
        ctx.arc(spotX, cx, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.lineWhite;
        ctx.fill();

        // Penalty arc
        ctx.beginPath();
        const arcStartAngle = side === "left" ? 0.35 : Math.PI + 0.35;
        const arcEndAngle   = side === "left" ? Math.PI - 0.35 : Math.PI * 2 - 0.35;
        ctx.arc(spotX, cx, 55, arcStartAngle, arcEndAngle);
        ctx.stroke();
    }

    private _drawCornerArcs(): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const r  = this.field.cornerArcRadius;

        ctx.strokeStyle = COLORS.lineWhite;
        ctx.lineWidth = 1.5;

        const corners = [
            { x: 0,  y: 0,  s: 0,             e: Math.PI / 2 },
            { x: fw, y: 0,  s: Math.PI / 2,   e: Math.PI },
            { x: fw, y: fh, s: Math.PI,       e: Math.PI * 1.5 },
            { x: 0,  y: fh, s: Math.PI * 1.5, e: Math.PI * 2 },
        ];
        for (const c of corners) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, c.s, c.e);
            ctx.stroke();
        }
    }

    // ── Goals ───────────────────────────────────────────────
    private _drawGoals(): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const gw = this.field.goalWidth;
        const gd = this.field.goalDepth;
        const cx = fh / 2;

        // Left goal
        ctx.strokeStyle = COLORS.goalPost;
        ctx.lineWidth = 3;
        ctx.strokeRect(-gd, cx - gw / 2, gd, gw);

        // Right goal
        ctx.strokeRect(fw, cx - gw / 2, gd, gw);

        // Net lines
        ctx.strokeStyle = COLORS.goalNet;
        ctx.lineWidth = 0.5;
        const netSpacing = 10;
        for (let y = cx - gw / 2; y < cx + gw / 2; y += netSpacing) {
            ctx.beginPath(); ctx.moveTo(-gd, y); ctx.lineTo(0, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(fw, y); ctx.lineTo(fw + gd, y); ctx.stroke();
        }
        for (let x = -gd; x <= 0; x += netSpacing) {
            ctx.beginPath(); ctx.moveTo(x, cx - gw / 2); ctx.lineTo(x, cx + gw / 2); ctx.stroke();
        }
        for (let x = fw; x <= fw + gd; x += netSpacing) {
            ctx.beginPath(); ctx.moveTo(x, cx - gw / 2); ctx.lineTo(x, cx + gw / 2); ctx.stroke();
        }
    }

    // ── Player ──────────────────────────────────────────────
    private _drawPlayer(player: any, teamColor: string, secColor: string, showName: boolean): void {
        const ctx = this.ctx;
        const x = player.pos.x;
        const y = player.pos.y;
        const r = PHYSICS.PLAYER_RADIUS;

        // Init anim state
        if (!this.playerAnimStates.has(player.id)) {
            this.playerAnimStates.set(player.id, { legPhase: 0, prevX: x, prevY: y });
        }
        const anim = this.playerAnimStates.get(player.id)!;

        // Update leg animation
        const speed = distVec(player.pos, { x: anim.prevX, y: anim.prevY });
        anim.legPhase += speed * 0.25;
        anim.prevX = x; anim.prevY = y;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(x, y + r - 1, r * 0.8, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.shadow;
        ctx.fill();

        // Body circle
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = teamColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Jersey number
        ctx.fillStyle = secColor;
        ctx.font = `bold ${r < 8 ? 6 : 7}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(player.number), x, y);

        // Ball possession indicator
        if (player.hasBall) {
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,220,50,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Player name
        if (showName) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "6px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const shortName = player.name.split(" ")[1] ?? player.name;
            ctx.fillText(shortName, x, y + r + 3);
        }

        // State indicator dot
        const stateColors: Record<string, string> = {
            defending:    "#ff4444",
            passing:      "#44aaff",
            shooting:     "#ffaa00",
            dribbling:    "#44ff88",
            celebrating:  "#ffdd00",
        };
        if (stateColors[player.state]) {
            ctx.beginPath();
            ctx.arc(x + r - 2, y - r + 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = stateColors[player.state];
            ctx.fill();
        }
    }

    // ── Ball ─────────────────────────────────────────────────
    private _drawBall(ball: Ball): void {
        const ctx = this.ctx;
        const x = ball.pos.x;
        const y = ball.pos.y;
        const r = PHYSICS.BALL_RADIUS;

        // Height visual: offset shadow further for airborne ball
        const shadowOffset = 2 + ball.height * 0.08;
        const visualY = y - ball.height * 0.3; // visual lift

        // Shadow
        ctx.beginPath();
        ctx.ellipse(x, y + shadowOffset, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fill();

        // Ball
        ctx.beginPath();
        ctx.arc(x, visualY, r + ball.height * 0.04, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ballMain;
        ctx.fill();

        // Pentagon panels
        const panels = 5;
        const panelR = r * 0.45;
        for (let i = 0; i < panels; i++) {
            const angle = (i / panels) * Math.PI * 2;
            const px = x + Math.cos(angle) * panelR;
            const py = visualY + Math.sin(angle) * panelR;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.ballPanel;
            ctx.fill();
        }

        // Outline
        ctx.beginPath();
        ctx.arc(x, visualY, r + ball.height * 0.04, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    // ── Possession indicator ──────────────────────────────
    private _drawPossessionIndicator(homeTeam: Team, awayTeam: Team, ball: Ball): void {
        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.hasBall);
        if (!owner) return;

        const ctx = this.ctx;
        const color = owner.team === "home" ? homeTeam.color : awayTeam.color;

        ctx.beginPath();
        ctx.arc(owner.pos.x, owner.pos.y - PHYSICS.PLAYER_RADIUS - 10, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}