import { ChevronDown } from 'lucide-react';

export function StatsPanel() {
    return (
        <div className="space-y-3">
            {/* Coach Summary */}
            <StatCard
                icon="⭐"
                title="COACH SUMMARY"
                badge="Exciting young prospect who isn't far from first team level"
            >
                <div className="mt-2 space-y-1">
                    <RatingRow label="POTENTIAL ABILITY" stars={3.5} />
                </div>
            </StatCard>

            {/* Goalkeeper Rating */}
            <StatCard
                icon="🧤"
                title="GOALKEEPER RATING"
                badge="5"
            >
                <div className="text-xs text-gray-400 mt-2">
                    MEDIA DESCRIPTION<br />
                    <span className="text-white">Fairly Ambitious</span>
                </div>
            </StatCard>

            {/* Personality */}
            <StatCard
                icon="👤"
                title="PERSONALITY"
            >
                <div className="text-xs text-gray-400 mt-2">
                    <p>Fairly Ambitious</p>
                    <p>Likes To Beat</p>
                    <p>Opponent Repeatedly</p>
                </div>
            </StatCard>

            {/* Preferred Rating */}
            <StatCard
                icon="⚽"
                title="PREFERRED RATING"
            >
                <div className="text-xs text-gray-400 mt-2">
                    <p>Right</p>
                </div>
            </StatCard>

            {/* Player Traits */}
            <StatCard
                icon="🎯"
                title="PLAYER TRAITS"
            >
                <div className="text-xs text-gray-400 mt-2">
                    <p>Tries Tricks</p>
                    <p>Likes To Beat</p>
                    <p>Opponent Repeatedly</p>
                </div>
            </StatCard>

            {/* Biography */}
            <StatCard
                icon="📖"
                title="BIOGRAPHY"
            >
                <div className="text-xs text-gray-300 mt-2 leading-relaxed">
                    <p className="mb-2">
                        Jérémy Doku is a well-known name for football fans across Europe.
                        Doku made his professional debut in the Jupiler Pro League, playing
                        for RSC Anderlecht against STVV on 25th November 2018.
                    </p>
                    <p>
                        Doku delivered when it mattered most, scoring on his senior club
                        goal for the Belgian club against Anderlecht, playing against
                        Oostende on 1st December 2019 in the Jupiler Pro League. Having
                        made the Belgium international debut against Denmark in September
                        2020, he has gone on to make 15 appearances on the...
                    </p>
                </div>
            </StatCard>

            {/* Bans */}
            <StatCard
                icon="🚫"
                title="BANS"
            >
                <div className="text-xs text-gray-400 mt-2">
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-gray-700 rounded" />
                            <span>Club World Championship</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-gray-700 rounded" />
                            <span>UEFA Champions League, UEFA Super Cup</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-gray-700 rounded" />
                            <span>English Premier Division</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-gray-700 rounded" />
                            <span>English FA Cup</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-gray-700 rounded" />
                            <span>Carabao Cup</span>
                        </div>
                    </div>
                </div>
            </StatCard>

            {/* Career Stats */}
            <StatCard
                icon="📊"
                title="CAREER STATS"
            >
                <div className="mt-3">
                    <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                        <span>YEAR</span>
                        <span>TEAM</span>
                        <span>APPS</span>
                        <span>GOALS</span>
                    </div>
                    <div className="space-y-1">
                        <CareerRow year="23-24" team="Man City" apps="0" goals="-" />
                        <CareerRow year="20-24" team="Rennes" apps="73" goals="9" />
                        <CareerRow year="18-21" team="RSC Anderlecht" apps="36" goals="5" />
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-700 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Overall 3 Clubs</span>
                            <span className="text-white font-semibold">109</span>
                            <span className="text-white font-semibold">14</span>
                        </div>
                    </div>
                </div>
            </StatCard>

            {/* Season Stats */}
            <StatCard
                icon="📈"
                title="SEASON STATS"
            >
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="text-gray-500">
                        <tr>
                            <th className="text-left pb-2">APPS</th>
                            <th className="text-center pb-2">GLS</th>
                            <th className="text-center pb-2">ASTS</th>
                            <th className="text-center pb-2">XG</th>
                            <th className="text-center pb-2">XA</th>
                            <th className="text-center pb-2">PENS</th>
                            <th className="text-center pb-2">POM</th>
                        </tr>
                        </thead>
                        <tbody className="text-gray-300">
                        <tr className="border-b border-gray-800">
                            <td className="py-1.5">0 (0)</td>
                            <td className="text-center">0</td>
                            <td className="text-center">0</td>
                            <td className="text-center">-</td>
                            <td className="text-center">-</td>
                            <td className="text-center">0 (0)</td>
                            <td className="text-center">0</td>
                        </tr>
                        </tbody>
                    </table>
                    <div className="mt-2 text-[10px] text-gray-500">
                        <p>Non Competitive</p>
                    </div>
                </div>
            </StatCard>
        </div>
    );
}

interface StatCardProps {
    icon: string;
    title: string;
    badge?: string;
    children?: React.ReactNode;
}

function StatCard({ icon, title, badge, children }: StatCardProps) {
    return (
        <div className="bg-[#13151f] rounded-lg border border-gray-800">
            <button className="w-full p-3 flex items-start gap-2 hover:bg-gray-800/30 transition-colors">
                <span className="text-lg">{icon}</span>
                <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-yellow-500">{title}</h3>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </div>
                    {badge && (
                        <p className="text-xs font-semibold text-white mt-1">{badge}</p>
                    )}
                    {children}
                </div>
            </button>
        </div>
    );
}

function RatingRow({ label, stars }: { label: string; stars: number }) {
    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{label}</span>
            <div className="flex">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} filled={i < Math.floor(stars)} half={i < stars && i >= Math.floor(stars)} />
                ))}
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

function CareerRow({ year, team, apps, goals }: { year: string; team: string; apps: string; goals: string }) {
    return (
        <div className="flex items-center justify-between text-xs py-1">
            <span className="text-gray-400">{year}</span>
            <div className="flex items-center gap-1">
                <img
                    src="https://images.football.ua/i/football/team/logo/0x160/34.png"
                    alt={team}
                    className="w-4 h-4"
                />
                <span className="text-white">{team}</span>
            </div>
            <span className="text-white">{apps}</span>
            <span className="text-white">{goals}</span>
        </div>
    );
}