import { ChevronDown } from 'lucide-react';

export function RoleAndDuty() {
    const roles = [
        { name: 'Winger (Su)', stars: 3.5 },
        { name: 'Inverted Winger (At)', stars: 3.5 },
        { name: 'Inverted Forward (Su)', stars: 3.5 },
        { name: 'Advanced Playmaker (At)', stars: 3 },
    ];

    return (
        <div className="bg-[#13151f] rounded-lg border border-gray-800">
            <div className="p-3 border-b border-gray-800">
                <h3 className="text-xs font-semibold text-yellow-500 mb-2">ROLE AND DUTY</h3>

                <div className="space-y-2">
                    {roles.map((role, index) => (
                        <button
                            key={index}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded text-xs transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} filled={i < Math.floor(role.stars)} half={i < role.stars && i >= Math.floor(role.stars)} />
                                    ))}
                                </div>
                                <span className="text-gray-300">{role.name}</span>
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Star({ filled, half }: { filled?: boolean; half?: boolean }) {
    return (
        <span className={`text-sm ${filled ? 'text-yellow-500' : half ? 'text-yellow-500/50' : 'text-gray-600'}`}>
            ★
        </span>
    );
}