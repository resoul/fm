import type { MatchEvent } from "./types";

type EventCallback = (event: MatchEvent) => void;

/**
 * A simple event bus for decoupled communication between the simulation 
 * and the UI/Renderer/Sound layers.
 */
export class EventBus {
    private listeners: Map<string, Set<EventCallback>> = new Map();

    /**
     * Subscribe to a specific event type or "all"
     */
    on(type: string, callback: EventCallback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(callback);
    }

    off(type: string, callback: EventCallback) {
        this.listeners.get(type)?.delete(callback);
    }

    /**
     * Emit a match event
     */
    emit(event: MatchEvent) {
        // Notify specific type listeners
        this.listeners.get(event.type)?.forEach(cb => cb(event));
        
        // Notify global listeners
        this.listeners.get("all")?.forEach(cb => cb(event));
    }

    clear() {
        this.listeners.clear();
    }
}

export const eventBus = new EventBus();
