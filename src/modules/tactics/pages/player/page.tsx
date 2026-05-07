import { useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PositionLevel = "natural" | "accomplished" | "trained" | "none";

export type PositionKey =
    | "GK"
    | "DC" | "DL" | "DR"
    | "WBC" | "WBL" | "WBR"
    | "MC" | "ML" | "MR"
    | "AMC" | "AML" | "AMR"
    | "SC" | "SL" | "SR";

export interface Role {
    name: string;
    duty?: string;
    stars: number; // 0–5, step 0.5
}

export interface PlayerRolesProps {
    playerName?: string;
    playerPositions?: Partial<Record<PositionKey, PositionLevel>>;
    rolesByPosition?: Partial<Record<PositionKey, Role[]>>;
    defaultSelected?: PositionKey | null;
}

interface FootballFieldProps {
    playerPositions: Partial<Record<PositionKey, PositionLevel>>;
    selected: PositionKey | null;
    onSelect: (key: PositionKey) => void;
}

interface StarRatingProps {
    stars: number;
    max?: number;
}

interface RoleRowProps {
    role: Role;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<PositionLevel, string> = {
    natural:      "#00e676",
    accomplished: "#69c75a",
    trained:      "#f0c040",
    none:         "#3a3a3a",
};

const LEVEL_LABEL: Record<PositionLevel, string> = {
    natural:      "Natural",
    accomplished: "Accomplished",
    trained:      "Trained",
    none:         "—",
};

const POSITIONS: Record<PositionKey, { x: number; y: number }> = {
    GK:  { x: 4,  y: 50 },

    DC:  { x: 20, y: 50 },
    DL:  { x: 20, y: 22 },
    DR:  { x: 20, y: 78 },

    WBL: { x: 36, y: 10 },
    WBC: { x: 36, y: 50 },
    WBR: { x: 36, y: 90 },

    ML:  { x: 54, y: 18 },
    MC:  { x: 54, y: 50 },
    MR:  { x: 54, y: 82 },

    AML: { x: 72, y: 18 },
    AMC: { x: 72, y: 50 },
    AMR: { x: 72, y: 82 },

    SL:  { x: 89, y: 28 },
    SC:  { x: 89, y: 50 },
    SR:  { x: 89, y: 72 },
};

// ─── FootballField ─────────────────────────────────────────────────────────────

function FootballField({ playerPositions, selected, onSelect }: FootballFieldProps) {
    const [hovered, setHovered] = useState<PositionKey | null>(null);

    return (
        <svg viewBox="0 0 240 155" width="100%" style={{ display: "block" }}>
            <rect x="0" y="0" width="240" height="155" rx="6" fill="#1a3520" />

            {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect
                    key={i}
                    x={8 + i * 37}
                    y="8"
                    width="18.5"
                    height="139"
                    fill={i % 2 === 0 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.03)"}
                />
            ))}

            <g stroke="#2d5e2d" strokeWidth="1" fill="none">
                <rect x="8" y="8" width="224" height="139" />
                <line x1="120" y1="8" x2="120" y2="147" />
                <circle cx="120" cy="77.5" r="20" />
                <circle cx="120" cy="77.5" r="2" fill="#2d5e2d" stroke="none" />
                <rect x="8" y="42" width="34" height="71" />
                <rect x="8" y="57" width="14" height="41" />
                <rect x="1" y="63" width="7" height="29" />
                <rect x="198" y="42" width="34" height="71" />
                <rect x="218" y="57" width="14" height="41" />
                <rect x="232" y="63" width="7" height="29" />
            </g>

            {(Object.entries(POSITIONS) as [PositionKey, { x: number; y: number }][]).map(([key, pos]) => {
                const cx = 8 + (pos.x / 100) * 224;
                const cy = 8 + (pos.y / 100) * 139;
                const level: PositionLevel = playerPositions[key] ?? "none";
                const color = LEVEL_COLORS[level];
                const isSelected = selected === key;
                const isHovered = hovered === key;
                const hasPosition = level !== "none";
                const r = 6.5;

                return (
                    <g
                        key={key}
                        style={{ cursor: "pointer" }}
                        onClick={() => onSelect(key)}
                        onMouseEnter={() => setHovered(key)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        {hasPosition && (
                            <circle
                                cx={cx} cy={cy} r={r + 5}
                                fill={color}
                                opacity={isSelected ? 0.28 : isHovered ? 0.18 : 0.1}
                            />
                        )}
                        <circle
                            cx={cx} cy={cy} r={isSelected ? r + 1 : r}
                            fill={color}
                            opacity={hasPosition ? 1 : 0.2}
                        />
                        {isSelected && (
                            <circle cx={cx} cy={cy} r={r + 4}
                                    fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.85" />
                        )}
                        {isHovered && !isSelected && (
                            <circle cx={cx} cy={cy} r={r + 2.5}
                                    fill="none" stroke="#fff" strokeWidth="1" opacity="0.35" />
                        )}
                        <text
                            x={cx} y={cy + r + 9}
                            textAnchor="middle"
                            fill={hasPosition ? color : "#444"}
                            fontSize="6.5"
                            fontFamily="'Segoe UI', sans-serif"
                            fontWeight={isSelected ? "700" : "500"}
                            style={{ pointerEvents: "none" }}
                        >
                            {key}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── StarRating ────────────────────────────────────────────────────────────────

function StarRating({ stars, max = 5 }: StarRatingProps) {
    return (
        <span style={{ display: "inline-flex", gap: 1.5, alignItems: "center", flexShrink: 0 }}>
      {Array.from({ length: max }).map((_, i) => {
          const fill = Math.min(1, Math.max(0, stars - i));
          const pct = fill >= 1 ? "100%" : fill >= 0.5 ? "50%" : "0%";
          const id = `star-${i}-${Math.random().toString(36).slice(2, 6)}`;
          return (
              <svg key={i} width="13" height="13" viewBox="0 0 14 14">
                  <defs>
                      <linearGradient id={id}>
                          <stop offset={pct} stopColor="#f0c040" />
                          <stop offset={pct} stopColor="#2a2a2a" />
                      </linearGradient>
                  </defs>
                  <polygon
                      points="7,1 8.8,5.3 13.5,5.7 10,8.7 11.1,13.2 7,10.7 2.9,13.2 4,8.7 0.5,5.7 5.2,5.3"
                      fill={`url(#${id})`}
                  />
              </svg>
          );
      })}
    </span>
    );
}

// ─── RoleRow ───────────────────────────────────────────────────────────────────

function RoleRow({ role }: RoleRowProps) {
    const [hov, setHov] = useState(false);
    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                background: hov ? "rgba(255,255,255,0.04)" : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                transition: "background 0.12s",
            }}
        >
            <StarRating stars={role.stars} />
            <span style={{ color: "#d0d0d0", fontSize: 13, flex: 1 }}>
        {role.name}
                {role.duty && (
                    <span style={{ color: "#555", marginLeft: 5, fontSize: 11 }}>({role.duty})</span>
                )}
      </span>
            <svg width="10" height="10" viewBox="0 0 12 12" style={{ opacity: 0.2, flexShrink: 0 }}>
                <polyline points="3,2 7,6 3,10" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </svg>
        </div>
    );
}

// ─── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
    return (
        <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            padding: "6px 14px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
            {(Object.entries(LEVEL_COLORS) as [PositionLevel, string][]).map(([level, color]) => (
                <div key={level} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: color,
                        opacity: level === "none" ? 0.25 : 1,
                        boxShadow: level !== "none" ? `0 0 4px ${color}66` : "none",
                    }} />
                    <span style={{ fontSize: 9.5, color: "#555", letterSpacing: 0.2 }}>
            {LEVEL_LABEL[level]}
          </span>
                </div>
            ))}
        </div>
    );
}

// ─── PlayerRoles ───────────────────────────────────────────────────────────────

export default function PlayerRoles({
                                        playerName = "Player",
                                        playerPositions = {},
                                        rolesByPosition = {},
                                        defaultSelected = null,
                                    }: PlayerRolesProps) {
    const firstActive = (Object.keys(POSITIONS) as PositionKey[]).find(
        (k) => playerPositions[k] && playerPositions[k] !== "none"
    );

    const [selected, setSelected] = useState<PositionKey | null>(
        defaultSelected ?? firstActive ?? null
    );

    const level: PositionLevel = selected ? (playerPositions[selected] ?? "none") : "none";
    const color = LEVEL_COLORS[level];
    const label = LEVEL_LABEL[level];
    const roles: Role[] = (selected && rolesByPosition[selected]) ?? [];

    return (
        <div style={{
            background: "#181c20",
            borderRadius: 12,
            width: 310,
            fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
            color: "#fff",
            boxShadow: "0 8px 40px rgba(0,0,0,0.65)",
            overflow: "hidden",
        }}>
            {/* Header */}
            <div style={{
                padding: "12px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>{playerName}</span>
                {selected && level !== "none" && (
                    <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        color,
                        textTransform: "uppercase",
                        background: `${color}18`,
                        padding: "3px 8px",
                        borderRadius: 4,
                    }}>
            {selected} · {label}
          </span>
                )}
            </div>

            {/* Field */}
            <div style={{ padding: "10px 14px 2px" }}>
                <FootballField
                    playerPositions={playerPositions}
                    selected={selected}
                    onSelect={setSelected}
                />
            </div>

            {/* Legend */}
            <Legend />

            {/* Roles */}
            {roles.length > 0 && (
                <div style={{
                    padding: "8px 14px 4px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    color: "#444",
                    textTransform: "uppercase",
                }}>
                    Role and Duty
                </div>
            )}

            {roles.length > 0 ? (
                roles.map((role, i) => <RoleRow key={i} role={role} />)
            ) : (
                <div style={{ padding: "14px", fontSize: 12, color: "#3a3a3a", textAlign: "center" }}>
                    {selected ? "No roles for this position" : "Select a position"}
                </div>
            )}

            <div style={{ height: 8 }} />
        </div>
    );
}

// ─── Demo ──────────────────────────────────────────────────────────────────────

const demoPositions: Partial<Record<PositionKey, PositionLevel>> = {
    GK:  "none",
    DC:  "natural",
    DL:  "accomplished",
    DR:  "accomplished",
    WBL: "trained",
    WBC: "none",
    WBR: "trained",
    ML:  "accomplished",
    MC:  "natural",
    MR:  "accomplished",
    AML: "accomplished",
    AMC: "none",
    AMR: "natural",
    SL:  "trained",
    SC:  "accomplished",
    SR:  "none",
};

const demoRoles: Partial<Record<PositionKey, Role[]>> = {
    DC: [
        { name: "Central Defender", duty: "De", stars: 5 },
        { name: "Libero", duty: "Su", stars: 3.5 },
        { name: "Ball-Playing Defender", duty: "De", stars: 3 },
    ],
    DL: [
        { name: "Full Back", duty: "Su", stars: 4 },
        { name: "Wing Back", duty: "At", stars: 3.5 },
    ],
    DR: [
        { name: "Full Back", duty: "De", stars: 3.5 },
        { name: "No-Nonsense Full Back", duty: "De", stars: 3 },
    ],
    WBL: [{ name: "Wing Back", duty: "Su", stars: 2 }],
    WBR: [{ name: "Wing Back", duty: "At", stars: 2.5 }],
    ML: [
        { name: "Wide Midfielder", duty: "Su", stars: 3.5 },
        { name: "Winger", duty: "At", stars: 3 },
    ],
    MC: [
        { name: "Box-to-Box Midfielder", duty: "Su", stars: 5 },
        { name: "Deep Lying Playmaker", duty: "De", stars: 4.5 },
        { name: "Ball Winning Midfielder", duty: "De", stars: 4 },
        { name: "Roaming Playmaker", duty: "Su", stars: 3.5 },
    ],
    MR: [{ name: "Wide Midfielder", duty: "De", stars: 3 }],
    AML: [
        { name: "Winger", duty: "At", stars: 4 },
        { name: "Inside Forward", duty: "Su", stars: 3.5 },
    ],
    AMR: [
        { name: "Winger", duty: "Su", stars: 5 },
        { name: "Wide Forward", duty: "At", stars: 4.5 },
        { name: "Inside Winger", duty: "At", stars: 4 },
        { name: "Raumdeuter", duty: "At", stars: 3.5 },
        { name: "Inside Forward", duty: "Su", stars: 3 },
    ],
    SL: [{ name: "Advanced Forward", duty: "At", stars: 2.5 }],
    SC: [
        { name: "Advanced Forward", duty: "At", stars: 4.5 },
        { name: "False Nine", duty: "Su", stars: 4 },
        { name: "Complete Forward", duty: "At", stars: 3.5 },
    ],
};

export function Page() {
    return (
        <div style={{
            minHeight: "100vh",
            background: "#0d1014",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
        }}>
            <PlayerRoles
                playerName="Marcus Rashford"
                playerPositions={demoPositions}
                rolesByPosition={demoRoles}
                defaultSelected="AMR"
            />
        </div>
    );
}