import type { Player } from '../data';

const DUTY_COLOR: Record<string, string> = {
    Attack:  '#8b5cf6',
    attack:  '#8b5cf6',
    Support: '#27ae60',
    support: '#27ae60',
    Defend:  '#e74c3c',
    defend:  '#e74c3c',
};

const DUTY_ABBR: Record<string, string> = {
    Attack:  'At',
    attack:  'At',
    Support: 'Su',
    support: 'Su',
    Defend:  'De',
    defend:  'De',
};

/**
 * Creates a styled drag-ghost element matching the PitchPlayer component size,
 * appends it off-screen, sets it as the drag image, then removes it.
 */
export function setPlayerDragImage(
    e: React.DragEvent<HTMLDivElement>,
    player: Player,
) {
    const isGK       = player.position === 'GK';
    const shirtColor = isGK ? '#c0392b' : '#1a1a1a';
    const numberColor = '#f39c12';
    const dutyColor  = DUTY_COLOR[player.duty] ?? '#888';
    const dutyAbbr   = DUTY_ABBR[player.duty] ?? player.duty.slice(0, 2);
    const shortName  = player.name.length > 11
        ? player.name.split(' ').pop()!
        : player.name;

    // Ghost container — matches PitchPlayer layout exactly
    const ghost = document.createElement('div');
    ghost.style.cssText = [
        'position:fixed',
        'top:-300px',
        'left:-300px',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'gap:0px',
        'pointer-events:none',
        'z-index:9999',
    ].join(';');

    // SVG shirt — same viewBox="0 0 40 40", same width/height as PitchPlayer (77×77)
    ghost.innerHTML = `
        <svg width="77" height="77" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"
             style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7))">
            <path d="M8 12 L4 18 L10 20 L10 34 L30 34 L30 20 L36 18 L32 12 L26 10 Q20 14 14 10 Z"
                  fill="${shirtColor}" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
            <path d="M14 10 Q20 16 26 10"
                  fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
            <path d="M8 12 L4 18 L10 20 L10 16" fill="rgba(255,255,255,0.08)"/>
            <path d="M32 12 L36 18 L30 20 L30 16" fill="rgba(255,255,255,0.08)"/>
            <text x="20" y="26" text-anchor="middle" dominant-baseline="middle"
                  font-size="11" font-weight="bold" fill="${numberColor}"
                  font-family="Georgia,serif">${player.number}</text>
        </svg>

        <div style="
            background:rgba(15,15,25,0.92);
            border:1px solid rgba(255,255,255,0.15);
            border-radius:6px;
            padding:3px 7px;
            margin-top:0;
            min-width:82px;
            max-width:111px;
            text-align:center;
            backdrop-filter:blur(4px);
        ">
            <div style="
                display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:3px;
            ">
                <span style="font-size:12px;font-weight:700;color:#d4d4d4;font-family:monospace;letter-spacing:.03em">
                    ${player.role}
                </span>
                <span style="font-size:12px;color:rgba(255,255,255,.3)">–</span>
                <span style="font-size:12px;font-weight:700;color:${dutyColor};font-family:monospace">
                    ${dutyAbbr}
                </span>
            </div>
            <div style="
                font-size:13px;color:#f0f0f0;font-weight:600;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                font-family:system-ui,sans-serif;
            ">${shortName}</div>
        </div>
    `;

    document.body.appendChild(ghost);

    // Centre ghost: shirt is 77px tall, badge ~40px tall => total ~117px
    // Horizontally centre on the shirt (ghost width ~111px max)
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 38);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.removeChild(ghost);
        });
    });
}