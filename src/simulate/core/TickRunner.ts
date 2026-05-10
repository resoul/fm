export interface ITickRunner {
    tick(): void;
    start(): void;
    pause(): void;
    isRunning: boolean;
    isPaused: boolean;
}

export class TickRunner implements ITickRunner {
    private _isRunning: boolean = false;
    private _isPaused: boolean = false;
    private onTick: () => void;

    constructor(onTick: () => void) {
        this.onTick = onTick;
    }

    tick(): void {
        if (!this._isRunning || this._isPaused) return;
        this.onTick();
    }

    start(): void {
        this._isRunning = true;
        this._isPaused = false;
    }

    pause(): void {
        this._isPaused = !this._isPaused;
    }

    get isRunning(): boolean { return this._isRunning; }
    get isPaused(): boolean { return this._isPaused; }
}
