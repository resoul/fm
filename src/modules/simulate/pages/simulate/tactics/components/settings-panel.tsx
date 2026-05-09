import { RefreshCcw, Shield, Swords, Zap } from 'lucide-react';

export function SettingsPanel() {
    return (
        <div className="bg-[#1b1e2b] rounded-lg border border-zinc-800 h-full p-4 flex flex-col space-y-4 text-gray-300 overflow-y-auto">
            {/* Tactical Style */}
            <div className="bg-[#242936] p-3 rounded border border-zinc-700">
                <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Tactical Style</div>
                <div className="font-bold text-white text-lg mb-2">GENGENPRESS</div>
                <div className="w-full h-8 bg-zinc-800 rounded flex items-center justify-between px-2 cursor-pointer border border-zinc-600">
                    <span className="text-sm">Custom</span>
                    <RefreshCcw size={12} />
                </div>
            </div>

            {/* Mentality */}
            <div className="bg-[#242936] p-3 rounded border border-zinc-700">
                <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Mentality</div>
                <div className="w-full h-8 bg-zinc-800 rounded flex items-center px-2 cursor-pointer border border-zinc-600 text-sm space-x-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500 border border-white/20"></div>
                    <span>Balanced</span>
                </div>
            </div>

            {/* In Possession */}
            <div className="bg-[#242936] p-3 rounded border border-zinc-700 flex flex-col space-y-2">
                <div className="flex items-center space-x-2 border-b border-zinc-700 pb-2">
                    <Swords size={16} className="text-green-400" />
                    <div className="text-xs font-bold uppercase">In Possession</div>
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] text-green-300">Pass Into Space</div>
                    <div className="text-[10px] text-gray-500">Play Out Of Defence</div>
                    <div className="text-[10px] text-green-300">Higher Tempo</div>
                </div>
                <button className="w-full py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] uppercase font-bold text-green-400 rounded mt-2 border border-zinc-600">
                    Change
                </button>
            </div>

            {/* In Transition */}
            <div className="bg-[#242936] p-3 rounded border border-zinc-700 flex flex-col space-y-2">
                <div className="flex items-center space-x-2 border-b border-zinc-700 pb-2">
                    <Zap size={16} className="text-yellow-400" />
                    <div className="text-xs font-bold uppercase">In Transition</div>
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] text-green-300">Take Short Kicks</div>
                    <div className="text-[10px] text-gray-500">Distribute To Centre-Backs</div>
                    <div className="text-[10px] text-gray-500">Counter</div>
                    <div className="text-[10px] text-gray-500">Counter-Press</div>
                </div>
                <button className="w-full py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] uppercase font-bold text-yellow-400 rounded mt-2 border border-zinc-600">
                    Change
                </button>
            </div>

            {/* Out of Possession */}
            <div className="bg-[#242936] p-3 rounded border border-zinc-700 flex flex-col space-y-2">
                <div className="flex items-center space-x-2 border-b border-zinc-700 pb-2">
                    <Shield size={16} className="text-blue-400" />
                    <div className="text-xs font-bold uppercase">Out of Possession</div>
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] text-gray-500">Higher Defensive Line</div>
                    <div className="text-[10px] text-gray-500">High Press</div>
                    <div className="text-[10px] text-gray-500">Much More Often</div>
                    <div className="text-[10px] text-gray-500">Prevnt Short GK Distribution</div>
                </div>
                <button className="w-full py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] uppercase font-bold text-blue-400 rounded mt-2 border border-zinc-600">
                    Change
                </button>
            </div>
        </div>
    );
}
