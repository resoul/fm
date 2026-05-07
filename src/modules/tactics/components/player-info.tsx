export function PlayerInfo() {
    return (
        <div className="bg-[#13151f] rounded-lg p-4 border border-gray-800">
            <div className="flex items-start gap-3 mb-3">
                <img
                    src="https://images.football.ua/i/people/0x166/72/72165.jpg"
                    alt="Jérémy Doku"
                    className="w-20 h-20 rounded bg-gray-800"
                />
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <img
                            src="https://images.football.ua/i/country/16x0/68.jpg"
                            alt="Belgium"
                            className="w-5 h-3"
                        />
                        <span className="text-sm text-gray-400">Belgium</span>
                    </div>
                    <h2 className="text-lg font-bold mb-1">Jérémy Doku</h2>
                    <div className="text-xs text-gray-400 space-y-0.5">
                        <p><span className="font-semibold text-white">21 years old</span> (27/8/2002)</p>
                        <p><span className="font-semibold text-white">15 caps / 2 goals</span></p>
                        <p>6 U21 caps / 1 U21 goal</p>
                    </div>
                </div>
            </div>

            {/* Positions */}
            <div className="mt-4">
                <h3 className="text-xs font-semibold text-yellow-500 mb-2 flex items-center gap-1">
                    <span>▶</span> POSITIONS
                </h3>
                <div className="space-y-1 text-xs">
                    <PositionBar
                        position="Attacking Midfielder (Left)"
                        natural
                    />
                    <PositionBar
                        position="Attacking Midfielder (Centre)"
                        accomplished
                    />
                    <PositionBar
                        position="Winger (Left)"
                        accomplished
                    />
                    <PositionBar
                        position="Striker (Centre)"
                        accomplished
                    />
                    <PositionBar
                        position="Advanced Playmaker (Left)"
                        accomplished
                    />
                </div>
            </div>
        </div>
    );
}

function PositionBar({
                         position,
                         natural = false,
                         accomplished = false
                     }: {
    position: string;
    natural?: boolean;
    accomplished?: boolean;
}) {
    const bgColor = natural ? 'bg-green-600' : accomplished ? 'bg-yellow-600' : 'bg-red-600';

    return (
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${bgColor}`} />
            <span className="text-gray-300">{position}</span>
        </div>
    );
}