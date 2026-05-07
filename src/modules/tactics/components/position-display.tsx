export function PositionDisplay() {
    return (
        <div className="bg-[#13151f] rounded-lg p-4 border border-gray-800">
            <div className="relative bg-green-900/30 rounded-lg p-4" style={{ aspectRatio: '1/1.4' }}>
                {/* Football pitch markings */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 420">
                    {/* Pitch outline */}
                    <rect x="10" y="10" width="280" height="400"
                          fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />

                    {/* Center line */}
                    <line x1="10" y1="210" x2="290" y2="210"
                          stroke="#4ade80" strokeWidth="2" opacity="0.3" />

                    {/* Center circle */}
                    <circle cx="150" cy="210" r="40"
                            fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />
                    <circle cx="150" cy="210" r="3"
                            fill="#4ade80" opacity="0.3" />

                    {/* Penalty areas */}
                    <rect x="80" y="10" width="140" height="70"
                          fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />
                    <rect x="80" y="340" width="140" height="70"
                          fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />

                    {/* Goal areas */}
                    <rect x="120" y="10" width="60" height="30"
                          fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />
                    <rect x="120" y="380" width="60" height="30"
                          fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.3" />
                </svg>

                {/* Player position indicators */}
                <div className="absolute" style={{ left: '25%', top: '40%' }}>
                    <div className="w-10 h-10 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                        <span className="text-xs font-bold">AM(L)</span>
                    </div>
                </div>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <p className="text-xs text-center text-gray-400">Attacking Midfielder (Left)</p>
                </div>
            </div>
        </div>
    );
}