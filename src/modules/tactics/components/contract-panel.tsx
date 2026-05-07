import { ChevronDown } from 'lucide-react';

export function ContractPanel() {
    return (
        <div className="bg-[#13151f] rounded-lg border border-gray-800">
            <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-3">
                    <span className="text-xl">💰</span>
                    <div className="text-left">
                        <h3 className="text-xs font-semibold text-yellow-500">CONTRACT</h3>
                        <p className="text-xs font-semibold text-white mt-1">£40K p/w</p>
                    </div>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <ContractDetail label="(£21.8K p/w after tax)" />
                    <ContractDetail label="4 Bonuses / 0 Clauses" />
                    <ContractDetail label="Expires in 4 years, 11 months (30/6/2028)" />
                </div>
            </div>
        </div>
    );
}

function ContractDetail({ label }: { label: string }) {
    return (
        <p className="text-gray-400">{label}</p>
    );
}