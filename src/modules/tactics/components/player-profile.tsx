import { Header } from './header';
import { PlayerInfo } from './player-info';
import { PositionDisplay } from './position-display';
import { AttributesPanel } from './attributes-panel';
import { RoleAndDuty } from './role-and-duty';
import { StatusPanels } from './status-panels';
import { ContractPanel } from './contract-panel';
import { StatsPanel } from './stats-panel';

export function PlayerProfile() {
    return (
        <div className="flex flex-col h-screen bg-[#1a1d29] text-gray-100">
            <Header />

            <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-12 gap-4">
                    {/* Left Column */}
                    <div className="col-span-3 space-y-4">
                        <PlayerInfo />
                        <PositionDisplay />
                        <RoleAndDuty />
                        <StatusPanels />
                    </div>

                    {/* Middle Column */}
                    <div className="col-span-6 space-y-4">
                        <AttributesPanel />
                        <ContractPanel />
                    </div>

                    {/* Right Column */}
                    <div className="col-span-3 space-y-4">
                        <StatsPanel />
                    </div>
                </div>
            </div>
        </div>
    );
}