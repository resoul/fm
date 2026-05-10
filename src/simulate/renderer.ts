// ============================================================
// RENDERER — Canvas 2D top-down football football renderer
// ============================================================

import type { Ball, Team, MatchState, FieldDimensions, RenderOptions, Vec2, Player } from "./types";
import { PHYSICS, distVec } from "./physics";
import type { TacticalData } from "./context";

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
    private canvas: HTMLCanvasElement;
    private field: FieldDimensions;

    constructor(canvas: HTMLCanvasElement, field: FieldDimensions) {
        this.canvas = canvas;
        this.field = field;
        this.ctx = canvas.getContext("2d")!;
    }

    triggerGoalFlash() { this.goalFlashTimer = 60; }

    render(
        homeTeam: Readonly<Team>,
        awayTeam: Readonly<Team>,
        ball: Readonly<Ball>,
        _state: Readonly<MatchState>,
        opts: RenderOptions,
        tactical?: TacticalData,
    ): void {
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

        // Debug: Influence Map
        if (opts.showHeatmap && tactical?.influenceMap) {
            this._drawInfluenceMap(tactical.influenceMap);
        }

        // 7.2 Pressure Heatmap (alternative to influence)
        if (opts.showPressureHeatmap && tactical?.pressureMap) {
            this._drawPressureHeatmap(tactical.pressureMap);
        }

        this._drawGoals();

        // Goal flash
        if (this.goalFlashTimer > 0) {
            ctx.fillStyle = COLORS.goalFlash;
            ctx.fillRect(0, 0, fw, fh);
            this.goalFlashTimer--;
        }

        // 7.2 Zone grid
        if (opts.showZones) {
            this._drawZoneGrid(homeTeam, awayTeam);
        }

        // Debug: Tactical Overlay (Centroids & Shape)
        if (opts.showHeatmap && tactical) {
            this._drawTacticalOverlay(tactical, homeTeam, awayTeam);
        }

        // 7.2 Defensive lines
        if (opts.showDefensiveLine && tactical) {
            this._drawDefensiveLines(homeTeam, awayTeam, tactical);
        }

        // Draw players
        for (const player of [...homeTeam.players, ...awayTeam.players]) {
            const teamColor = player.team === "home" ? homeTeam.color : awayTeam.color;
            const secColor = player.team === "home" ? homeTeam.secondaryColor : awayTeam.secondaryColor;
            this._drawPlayer(player, teamColor, secColor, opts.showNames);
            
            if (opts.showDebugInfo) {
                this._drawPlayerDebug(player, tactical);
            }
        }

        // 7.2 Passing lanes (drawn over players so arrows are visible)
        if (opts.showPassingLanes && tactical?.passingLanes) {
            this._drawPassingLanes(tactical.passingLanes, homeTeam, awayTeam);
        }

        // Draw ball
        this._drawBall(ball);

        // Draw possession indicator
        if (opts.showPossessionArrow) {
            this._drawPossessionIndicator(homeTeam, awayTeam, ball);
        }

        ctx.restore();
    }

    // ── 7.2 Zone Grid ───────────────────────────────────────
    private _drawZoneGrid(home: Readonly<Team>, away: Readonly<Team>): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const COLS = 6;
        const ROWS = 5;
        const cellW = fw / COLS;
        const cellH = fh / ROWS;

        ctx.save();
        ctx.globalAlpha = 0.08;

        // Fill zone dominance by counting players per zone
        const homeCounts = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));
        const awayCounts = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));

        for (const p of home.players) {
            const col = Math.floor((p.pos.x / fw) * COLS);
            const row = Math.floor((p.pos.y / fh) * ROWS);
            if (col >= 0 && col < COLS && row >= 0 && row < ROWS)
                homeCounts[col][row]++;
        }
        for (const p of away.players) {
            const col = Math.floor((p.pos.x / fw) * COLS);
            const row = Math.floor((p.pos.y / fh) * ROWS);
            if (col >= 0 && col < COLS && row >= 0 && row < ROWS)
                awayCounts[col][row]++;
        }

        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const h = homeCounts[c][r];
                const a = awayCounts[c][r];
                if (h > a) {
                    ctx.fillStyle = home.color;
                    ctx.globalAlpha = 0.06 + h * 0.04;
                } else if (a > h) {
                    ctx.fillStyle = away.color;
                    ctx.globalAlpha = 0.06 + a * 0.04;
                } else {
                    continue;
                }
                ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
            }
        }

        // Grid lines
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 6]);
        for (let c = 1; c < COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellW, 0);
            ctx.lineTo(c * cellW, fh);
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellH);
            ctx.lineTo(fw, r * cellH);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── 7.2 Defensive Lines ─────────────────────────────────
    private _drawDefensiveLines(home: Readonly<Team>, away: Readonly<Team>, tactical: TacticalData): void {
        const ctx = this.ctx;
        const fh = this.field.height;

        // Line for HOME attackers (Red line, showing where they can't cross)
        if (tactical.homeDefensiveLine > 0) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 100, 100, 0.6)"; // Reddish for Home's limit
            ctx.lineWidth = 1.5;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(tactical.homeDefensiveLine, 0);
            ctx.lineTo(tactical.homeDefensiveLine, fh);
            ctx.stroke();
            
            ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
            ctx.font = "bold 9px monospace";
            ctx.fillText("OFFSIDE LINE", tactical.homeDefensiveLine + 4, 15);
            ctx.restore();
        }

        // Line for AWAY attackers (Blue line)
        if (tactical.awayDefensiveLine > 0) {
            ctx.save();
            ctx.strokeStyle = "rgba(100, 150, 255, 0.6)"; // Bluish for Away's limit
            ctx.lineWidth = 1.5;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(tactical.awayDefensiveLine, 0);
            ctx.lineTo(tactical.awayDefensiveLine, fh);
            ctx.stroke();
            
            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(100, 150, 255, 0.9)";
            ctx.font = "bold 9px monospace";
            ctx.fillText("OFFSIDE LINE", tactical.awayDefensiveLine - 4, 15);
            ctx.restore();
        }
    }

    // ── 7.2 Passing Lanes ────────────────────────────────────
    private _drawPassingLanes(
        lanes: { from: string; to: string; open: boolean }[],
        home: Readonly<Team>,
        away: Readonly<Team>,
    ): void {
        const ctx = this.ctx;
        const allPlayers = [...home.players, ...away.players];
        const playerById = new Map(allPlayers.map(p => [p.id, p]));

        // Only draw open lanes for ball carrier and their options
        const ballCarrier = allPlayers.find(p => p.hasBall);
        if (!ballCarrier) return;

        const relevantLanes = lanes.filter(l =>
            (l.from === ballCarrier.id) && l.open
        ).slice(0, 5); // max 5 lanes

        for (const lane of relevantLanes) {
            const from = playerById.get(lane.from);
            const to = playerById.get(lane.to);
            if (!from || !to) continue;

            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = lane.open ? "rgba(120,220,120,0.7)" : "rgba(220,80,80,0.4)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(from.pos.x, from.pos.y);
            ctx.lineTo(to.pos.x, to.pos.y);
            ctx.stroke();

            // Arrow head
            if (lane.open) {
                const dx = to.pos.x - from.pos.x;
                const dy = to.pos.y - from.pos.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const ux = dx / len;
                    const uy = dy / len;
                    const arrX = to.pos.x - ux * 14;
                    const arrY = to.pos.y - uy * 14;
                    ctx.setLineDash([]);
                    ctx.fillStyle = "rgba(120,220,120,0.6)";
                    ctx.beginPath();
                    ctx.moveTo(to.pos.x, to.pos.y);
                    ctx.lineTo(arrX - uy * 5, arrY + ux * 5);
                    ctx.lineTo(arrX + uy * 5, arrY - ux * 5);
                    ctx.fill();
                }
            }
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // ── 7.2 Pressure Heatmap ────────────────────────────────
    private _drawPressureHeatmap(map: number[][]): void {
        const ctx = this.ctx;
        const cellW = this.field.width / 10;
        const cellH = this.field.height / 7;

        ctx.globalAlpha = 0.2;
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 7; y++) {
                const val = (map[x] && map[x][y]) ? map[x][y] : 0;
                if (val <= 0) continue;
                const intensity = Math.min(1, val / 3);
                ctx.fillStyle = `rgba(255, 80, 30, ${intensity})`;
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // ── Influence Map ───────────────────────────────────────
    private _drawInfluenceMap(map: number[][]): void {
        const ctx = this.ctx;
        const cellW = this.field.width / 10;
        const cellH = this.field.height / 7;

        ctx.globalAlpha = 0.25;
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 7; y++) {
                const val = map[x][y]; 
                if (val === 0) continue;

                ctx.fillStyle = val > 0 ? `rgba(60, 100, 255, ${Math.min(0.8, val * 0.5)})` : `rgba(255, 60, 60, ${Math.min(0.8, Math.abs(val) * 0.5)})`;
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // ── Tactical Overlay ─────────────────────────────────────
    private _drawTacticalOverlay(tactical: TacticalData, home: Team, away: Team): void {
        const ctx = this.ctx;

        // Draw Centroids
        this._drawCentroid(tactical.homeCentroid, home.color);
        this._drawCentroid(tactical.awayCentroid, away.color);

        // Draw Team "Shell" (Bounding circles or hulls)
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        
        ctx.strokeStyle = home.color;
        ctx.beginPath();
        ctx.arc(tactical.homeCentroid.x, tactical.homeCentroid.y, tactical.homeCompactness, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = away.color;
        ctx.beginPath();
        ctx.arc(tactical.awayCentroid.x, tactical.awayCentroid.y, tactical.awayCompactness, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    private _drawCentroid(pos: Vec2, color: string): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(pos.x - 10, pos.y); ctx.lineTo(pos.x + 10, pos.y);
        ctx.moveTo(pos.x, pos.y - 10); ctx.lineTo(pos.x, pos.y + 10);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // ── Field ───────────────────────────────────────────────
    private _drawField(): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const stripeW = 60;

        ctx.fillStyle = COLORS.fieldGreen;
        ctx.fillRect(0, 0, fw, fh);

        for (let x = 0; x < fw; x += stripeW * 2) {
            ctx.fillStyle = COLORS.fieldStripe2;
            ctx.fillRect(x, 0, stripeW, fh);
        }

        ctx.strokeStyle = COLORS.lineWhite;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.strokeRect(2, 2, fw - 4, fh - 4);

        ctx.beginPath();
        ctx.moveTo(fw / 2, 2);
        ctx.lineTo(fw / 2, fh - 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(fw / 2, fh / 2, this.field.centerCircleRadius, 0, Math.PI * 2);
        ctx.stroke();

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

        const sbw = 40;
        const sbh = this.field.goalWidth + 30;
        const sx = side === "left" ? 0 : fw - sbw;
        const sy = cx - sbh / 2;
        ctx.strokeRect(sx, sy, sbw, sbh);

        const spotX = side === "left" ? 80 : fw - 80;
        ctx.beginPath();
        ctx.arc(spotX, cx, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.lineWhite;
        ctx.fill();
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

    private _drawGoals(): void {
        const ctx = this.ctx;
        const fw = this.field.width;
        const fh = this.field.height;
        const gw = this.field.goalWidth;
        const gd = this.field.goalDepth;
        const cx = fh / 2;

        ctx.strokeStyle = COLORS.goalPost;
        ctx.lineWidth = 3;
        ctx.strokeRect(-gd, cx - gw / 2, gd, gw);
        ctx.strokeRect(fw, cx - gw / 2, gd, gw);

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

    private _drawPlayerDebug(player: Player, tactical?: TacticalData): void {
        const ctx = this.ctx;
        const x = player.pos.x;
        const y = player.pos.y;

        // 1. Target Line (where they want to go)
        if (player.targetPos) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(player.targetPos.x, player.targetPos.y);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            // Tiny cross at target
            ctx.beginPath();
            ctx.moveTo(player.targetPos.x - 2, player.targetPos.y - 2);
            ctx.lineTo(player.targetPos.x + 2, player.targetPos.y + 2);
            ctx.moveTo(player.targetPos.x + 2, player.targetPos.y - 2);
            ctx.lineTo(player.targetPos.x - 2, player.targetPos.y + 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Zone Anchor (their tactical home)
        const zoneData = (tactical as any)?.zoneData;
        if (zoneData) {
            const assignment = zoneData.assignments.find((a: any) => a.playerId === player.id);
            if (assignment) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(assignment.zoneCentreWorld.x, assignment.zoneCentreWorld.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = player.team === "home" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)";
                ctx.fill();
                
                // Line to anchor
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(assignment.zoneCentreWorld.x, assignment.zoneCentreWorld.y);
                ctx.strokeStyle = "rgba(255,255,255,0.15)";
                ctx.lineWidth = 0.5;
                ctx.stroke();
                ctx.restore();
            }
        }

        // 3. State Label
        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = "bold 5px monospace";
        ctx.textAlign = "center";
        const decisionType = player.nextDecision?.type?.toUpperCase() ?? "IDLE";
        const runType = player.nextDecision?.offBallRunType ? ` [${player.nextDecision.offBallRunType}]` : "";
        ctx.fillText(`${decisionType}${runType}`, x, y - 12);
        ctx.restore();
    }

    private _drawPlayer(player: Player, teamColor: string, secColor: string, showName: boolean): void {
        const ctx = this.ctx;
        const x = player.pos.x;
        const y = player.pos.y;
        const r = PHYSICS.PLAYER_RADIUS;

        if (!this.playerAnimStates.has(player.id)) {
            this.playerAnimStates.set(player.id, { legPhase: 0, prevX: x, prevY: y });
        }
        const anim = this.playerAnimStates.get(player.id)!;
        const speed = distVec(player.pos, { x: anim.prevX, y: anim.prevY });
        anim.legPhase += speed * 0.25;
        anim.prevX = x; anim.prevY = y;

        ctx.beginPath();
        ctx.ellipse(x, y + r - 1, r * 0.8, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.shadow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = teamColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = secColor;
        ctx.font = `bold ${r < 8 ? 6 : 7}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(player.number), x, y);

        if (player.hasBall) {
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,220,50,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (showName) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "6px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const shortName = player.name.split(" ")[1] ?? player.name;
            ctx.fillText(shortName, x, y + r + 3);
        }

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

    private _drawBall(ball: Ball): void {
        const ctx = this.ctx;
        const x = ball.pos.x;
        const y = ball.pos.y;
        const r = PHYSICS.BALL_RADIUS;

        const shadowOffset = 2 + ball.height * 0.08;
        const visualY = y - ball.height * 0.3;

        ctx.beginPath();
        ctx.ellipse(x, y + shadowOffset, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, visualY, r + ball.height * 0.04, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ballMain;
        ctx.fill();

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

        ctx.beginPath();
        ctx.arc(x, visualY, r + ball.height * 0.04, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    private _drawPossessionIndicator(homeTeam: Readonly<Team>, awayTeam: Readonly<Team>, _ball: Readonly<Ball>): void {
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
