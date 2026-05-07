import { ChevronLeft, ChevronRight, Search, Edit, MessageSquare, HelpCircle } from 'lucide-react';

export function Header() {
    return (
        <header className="bg-[#13151f] border-b border-gray-800 px-4 py-2">
            <div className="flex items-center justify-between">
                {/* Left Section - Navigation */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <button className="p-1.5 hover:bg-gray-700/50 rounded">
                            <ChevronLeft className="w-5 h-5 text-gray-400" />
                        </button>
                        <button className="p-1.5 hover:bg-gray-700/50 rounded">
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <img
                            src="https://images.football.ua/i/football/team/logo/0x160/34.png"
                            alt="Man City"
                            className="w-6 h-6 rounded-full"
                        />
                        <button className="p-1 hover:bg-gray-700/50 rounded">
                            <ChevronLeft className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <div>
                            <h1 className="text-sm font-semibold">11. Jérémy Doku</h1>
                            <p className="text-xs text-gray-400">Attacking Midfielder (Left), Striker (Centre) / AM (L) - Man City</p>
                        </div>
                    </div>
                </div>

                {/* Middle Section - Tabs */}
                <nav className="flex items-center gap-1">
                    <TabButton active>Overview</TabButton>
                    <TabButton>Contract</TabButton>
                    <TabButton>Transfer</TabButton>
                    <TabButton>Development</TabButton>
                    <TabButton>Reports</TabButton>
                    <TabButton>Discuss</TabButton>
                    <TabButton>Comparison</TabButton>
                    <TabButton>History</TabButton>
                    <TabButton>Debug</TabButton>
                </nav>

                {/* Right Section - Actions */}
                <div className="flex items-center gap-2">
                    <button className="p-1.5 hover:bg-gray-700/50 rounded">
                        <Edit className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-1.5 hover:bg-gray-700/50 rounded">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-1.5 hover:bg-gray-700/50 rounded">
                        <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <span className="text-xs text-gray-400 ml-2">FM</span>
                    <div className="bg-yellow-500 text-black text-xs px-2 py-1 rounded">
                        Mon 09:00<br />3 Jul 2023
                    </div>
                    <button className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-1.5 rounded ml-2">
                        CONTINUE
                    </button>
                    <button className="p-1.5 hover:bg-gray-700/50 rounded">
                        <span className="text-gray-400">⚙</span>
                    </button>
                </div>
            </div>
        </header>
    );
}

function TabButton({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
    return (
        <button className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            active
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
        }`}>
            {children}
        </button>
    );
}