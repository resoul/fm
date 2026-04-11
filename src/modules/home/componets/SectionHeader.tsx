import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export function SectionHeader({ title, chevron = true }: { title: string; chevron?: boolean }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <span className={cn("text-xs font-bold uppercase tracking-wider", chevron ? "text-teal-400 cursor-pointer hover:text-teal-300" : "text-zinc-400")}>
                {title} {chevron && <ChevronRight className="inline size-3" />}
            </span>
        </div>
    );
}