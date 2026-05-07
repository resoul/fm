import { ChevronDown } from 'lucide-react';

export function StatusPanels() {
    return (
        <div className="space-y-3">
            {/* Fitness */}
            <StatusPanel
                icon="⚡"
                title="FITNESS"
                status="In superb condition"
                color="text-green-500"
            >
                <div className="grid grid-cols-2 gap-3 text-xs mt-2">
                    <StatusItem label="OVERALL PHYSICAL" value="Low" />
                    <StatusItem label="MATCH SHARPNESS" value="Low" />
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-500 rounded-sm flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                        </div>
                        <div className="w-4 h-4 bg-red-600 rounded-sm" />
                    </div>
                </div>
            </StatusPanel>

            {/* Dynamics */}
            <StatusPanel
                icon="🔄"
                title="DYNAMICS"
                status="Perfect"
                color="text-green-500"
            >
                <div className="text-xs mt-2 space-y-1">
                    <p className="text-gray-400">
                        <span className="font-semibold text-white">Current</span> (Core Social Group)
                    </p>
                    <p className="text-green-400">3 Positives / 7 Negatives</p>
                </div>
            </StatusPanel>

            {/* Form */}
            <StatusPanel
                icon="📋"
                title="FORM"
                status="None available"
                color="text-gray-500"
            />

            {/* Training */}
            <StatusPanel
                icon="🏃"
                title="TRAINING"
                color="text-yellow-500"
            >
                <div className="flex items-center gap-2 mt-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <span className="text-xs text-gray-300">Attacking Midfielder (Left)</span>
                </div>
                <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                    <p>Focus: <span className="text-white">None</span></p>
                    <p>Training Intensity: <span className="text-green-400">Normal Intensity</span></p>
                    <p>Training Happiness: <span className="text-green-400">TRN RAT</span></p>
                </div>
            </StatusPanel>

            {/* Contract */}
            <StatusPanel
                icon="💰"
                title="CONTRACT"
                status="£40K p/w"
                color="text-yellow-500"
            >
                <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                    <p>(£21.8K p/w after tax)</p>
                    <p>4 Bonuses / 0 Clauses</p>
                    <p>Expires in 4 years, 11 months (30/6/2028)</p>
                </div>
            </StatusPanel>

            {/* Transfer Status */}
            <StatusPanel
                icon="🔄"
                title="TRANSFER STATUS"
                status="Transfer status not set"
                color="text-yellow-500"
            >
                <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                    <p>Loan status not set</p>
                    <p>No automatic instructions set</p>
                    <p>No instructions for the Director of Football</p>
                </div>
            </StatusPanel>

            {/* Playing Time Pathway */}
            <StatusPanel
                icon="⏱️"
                title="PLAYING TIME PATHWAY"
                status="Actual: Squad Player"
                color="text-yellow-500"
            >
                <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                    <p>Agreed: Squad Player</p>
                    <p>Doesn't have a strong opinion about his playing time at present.</p>
                </div>
            </StatusPanel>
        </div>
    );
}

interface StatusPanelProps {
    icon: string;
    title: string;
    status?: string;
    color: string;
    children?: React.ReactNode;
}

function StatusPanel({ icon, title, status, color, children }: StatusPanelProps) {
    return (
        <div className="bg-[#13151f] rounded-lg border border-gray-800">
            <button className="w-full p-3 flex items-start gap-2 hover:bg-gray-800/30 transition-colors">
                <span className="text-lg">{icon}</span>
                <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-yellow-500">{title}</h3>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </div>
                    {status && (
                        <p className={`text-xs font-semibold mt-1 ${color}`}>{status}</p>
                    )}
                    {children}
                </div>
            </button>
        </div>
    );
}

function StatusItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-gray-500 text-[10px]">{label}</p>
            <p className="text-gray-300 font-medium">{value}</p>
        </div>
    );
}