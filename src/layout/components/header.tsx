import { Button } from "@/components/button";
import {
    PanelLeftClose,
    PanelLeftOpen,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Search,
    Globe,
    HelpCircle,
    ChevronRight as ArrowRight,
} from "lucide-react";
import { useLayout } from "./use-layout";
import { NavbarMenu } from './navbar-menu';
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useDateTime, nextDateTimeAction } from "@/state/useDateTime";
import Settings from "./menu/settings";

// Mock club data - replace with real data from context/props
const clubData = {
    number: 22,
    name: "YEHOR KLYMENCHUK",
    subtitle: "Defender (Left) / WB (L), DM - Metalist",
    logoUrl: undefined as string | undefined, // replace with actual logo URL
};

export function Header() {
    const { toggleSidebar, sidebarCollapsed } = useLayout();
    const navigate = useNavigate();

    const dateTime = useDateTime(state => state.dateTime);

    return (
        <div className="flex flex-col">
            {/* Top bar */}
            <div className="flex items-stretch min-h-[52px] bg-background">
                {/* Left section */}
                <div className="flex items-center gap-1 px-2">
                    {/* Sidebar toggle */}
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={toggleSidebar}
                        className="hidden lg:inline-flex"
                    >
                        {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </Button>

                    {/* Back / Forward */}
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={() => navigate(-1)}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={() => navigate(1)}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>

                {/* Club identity */}
                <div className="flex items-center gap-2 px-3">
                    {/* Club logo */}
                    <div className="relative flex items-center justify-center size-9 rounded-md overflow-hidden bg-muted shrink-0">
                        {clubData.logoUrl ? (
                            <img src={clubData.logoUrl} alt="Club logo" className="size-full object-contain" />
                        ) : (
                            // Placeholder shield
                            <svg viewBox="0 0 32 36" className="size-7 text-yellow-500" fill="currentColor">
                                <path d="M16 2L3 8v10c0 8.5 5.5 16.5 13 19 7.5-2.5 13-10.5 13-19V8L16 2z" />
                                <path d="M16 6L7 11v7c0 5.8 3.7 11.2 9 13.4 5.3-2.2 9-7.6 9-13.4v-7L16 6z" fill="currentColor" opacity="0.3" />
                            </svg>
                        )}
                    </div>

                    {/* Up/Down arrow to browse entities */}
                    <div className="flex flex-col gap-0">
                        <button className="flex items-center justify-center h-4 w-5 text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronUp className="size-3.5" />
                        </button>
                        <button className="flex items-center justify-center h-4 w-5 text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronDown className="size-3.5" />
                        </button>
                    </div>

                    {/* Search icon */}
                    <button className="flex items-center justify-center size-7 text-muted-foreground hover:text-foreground transition-colors">
                        <Search className="size-4" />
                    </button>

                    {/* Name & subtitle */}
                    <div className="flex flex-col justify-center min-w-0">
                        <span className="text-sm font-bold text-foreground leading-tight tracking-wide truncate">
                            {clubData.number && (
                                <span className="text-muted-foreground font-normal mr-1">{clubData.number}.</span>
                            )}
                            {clubData.name}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight truncate">
                            {clubData.subtitle}
                        </span>
                    </div>
                </div>

                {/* Spacer */}
                <div className="w-8" />

                {/* Right section */}
                <div className="flex items-center gap-1 px-2 ml-auto">
                    {/* Globe / online */}
                    <Button variant="ghost" mode="icon" size="sm">
                        <Globe className="size-4" />
                    </Button>

                    {/* Help */}
                    <Button variant="ghost" mode="icon" size="sm">
                        <HelpCircle className="size-4" />
                    </Button>

                    {/* FM badge */}
                    <Settings />
                    {/* <div className="px-2 py-0.5 text-xs font-bold text-muted-foreground rounded">
                        FM
                    </div> */}

                    {/* Divider */}
                    <div className="w-px h-7 bg-input mx-1" />

                    {/* Date / Time */}
                    <div className="flex flex-col items-end justify-center min-w-[90px]">
                        <span className="text-xs font-semibold text-foreground leading-tight">
                            {dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight">
                            {dateTime.toLocaleDateString()}
                        </span>
                    </div>

                    {/* Continue button */}
                    <Button
                        onClick={nextDateTimeAction}
                        size="sm"
                        className={cn(
                            "ms-2 gap-1.5 font-bold tracking-wider uppercase text-xs px-4 h-9",
                            "bg-teal-600 hover:bg-teal-500 text-white border-none"
                        )}
                    >
                        Continue
                        <ArrowRight className="size-3.5" />
                    </Button>
                </div>
            </div>

            {/* Bottom nav menu */}
            <NavbarMenu />
        </div>
    );
}