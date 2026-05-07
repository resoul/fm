import { ChevronDown } from 'lucide-react';

export function AttributesPanel() {
    return (
        <div className="bg-[#13151f] rounded-lg border border-gray-800">
            <div className="p-4">
                {/* Highlight selector */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400">Highlight</span>
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs">
                            <span>▼</span>
                            <ChevronDown className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Attributes Grid */}
                <div className="grid grid-cols-3 gap-6">
                    {/* Technical */}
                    <AttributeSection title="TECHNICAL" color="text-green-500">
                        <AttributeBar label="Corners" value={11} color="green" />
                        <AttributeBar label="Crossing" value={11} color="green" />
                        <AttributeBar label="Dribbling" value={15} color="green" />
                        <AttributeBar label="Finishing" value={11} color="green" />
                        <AttributeBar label="First Touch" value={14} color="green" />
                        <AttributeBar label="Free Kick Taking" value={8} color="amber" />
                        <AttributeBar label="Heading" value={8} color="amber" />
                        <AttributeBar label="Long Shots" value={8} color="amber" />
                        <AttributeBar label="Long Throws" value={5} color="red" />
                        <AttributeBar label="Marking" value={5} color="red" />
                        <AttributeBar label="Passing" value={13} color="green" />
                        <AttributeBar label="Penalty Taking" value={14} color="green" />
                        <AttributeBar label="Tackling" value={7} color="amber" />
                        <AttributeBar label="Technique" value={15} color="green" />
                    </AttributeSection>

                    {/* Mental */}
                    <AttributeSection title="MENTAL" color="text-blue-500">
                        <AttributeBar label="Aggression" value={14} color="cyan" />
                        <AttributeBar label="Anticipation" value={11} color="cyan" />
                        <AttributeBar label="Bravery" value={15} color="cyan" />
                        <AttributeBar label="Composure" value={11} color="cyan" />
                        <AttributeBar label="Concentration" value={10} color="cyan" />
                        <AttributeBar label="Decisions" value={9} color="cyan" />
                        <AttributeBar label="Determination" value={15} color="cyan" />
                        <AttributeBar label="Flair" value={16} color="cyan" />
                        <AttributeBar label="Leadership" value={6} color="cyan" />
                        <AttributeBar label="Off The Ball" value={12} color="cyan" />
                        <AttributeBar label="Positioning" value={7} color="cyan" />
                        <AttributeBar label="Teamwork" value={12} color="cyan" />
                        <AttributeBar label="Vision" value={10} color="cyan" />
                        <AttributeBar label="Work Rate" value={13} color="cyan" />
                    </AttributeSection>

                    {/* Physical */}
                    <AttributeSection title="PHYSICAL" color="text-orange-500">
                        <AttributeBar label="Acceleration" value={18} color="emerald" />
                        <AttributeBar label="Agility" value={16} color="emerald" />
                        <AttributeBar label="Balance" value={11} color="emerald" />
                        <AttributeBar label="Jumping Reach" value={8} color="emerald" />
                        <AttributeBar label="Natural Fitness" value={16} color="emerald" />
                        <AttributeBar label="Pace" value={17} color="emerald" />
                        <AttributeBar label="Stamina" value={13} color="emerald" />
                        <AttributeBar label="Strength" value={11} color="emerald" />

                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <div className="space-y-2 text-xs">
                                <PhysicalStat label="Height" value="171 cm" />
                                <PhysicalStat label="Weight" value="67 kg" />
                            </div>
                        </div>
                    </AttributeSection>
                </div>
            </div>
        </div>
    );
}

function AttributeSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className={`text-xs font-bold mb-3 ${color}`}>{title}</h3>
            <div className="space-y-1.5">
                {children}
            </div>
        </div>
    );
}

interface AttributeBarProps {
    label: string;
    value: number;
    color: 'green' | 'amber' | 'red' | 'cyan' | 'emerald';
}

function AttributeBar({ label, value, color }: AttributeBarProps) {
    const colorMap = {
        green: 'bg-green-600',
        amber: 'bg-amber-600',
        red: 'bg-red-600',
        cyan: 'bg-cyan-600',
        emerald: 'bg-emerald-600',
    };

    const bgColor = colorMap[color];
    const percentage = (value / 20) * 100;

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300 w-32 truncate">{label}</span>
            <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                <div
                    className={`h-full ${bgColor} transition-all`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="text-xs font-bold text-white w-6 text-right">{value}</span>
        </div>
    );
}

function PhysicalStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-gray-400">{label}</span>
            <span className="text-white font-medium">{value}</span>
        </div>
    );
}