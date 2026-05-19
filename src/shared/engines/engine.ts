export abstract class Engine {

    private engine_name = (this.constructor as typeof Engine).name || 'UnnamedEngine';
    private isBoot = false;
    private isKernelInitialized = false;
    private isEventRouteInitialized = false;
    private isTerminationHookBound = false;

    _boot() {
        if(this.isBoot) return;
        this.boot();
        this.isBoot = true;
    }

    _setupKernelSpace() {
        if(this.isKernelInitialized) return;
        this.setupKernelSpace();
        this.isKernelInitialized = true;
    }

    _setupEventRoutes() {
        if(this.isEventRouteInitialized) return;
        this.setupEventRoutes();
        this.isEventRouteInitialized = true;
    } 

    _setupKernelTerminationHook() {
        if(this.isTerminationHookBound) return;
        this.setupKernelTerminationHook();
        this.isTerminationHookBound = true;
    }

    abstract boot(): void;
    abstract setupEventRoutes(): void;
    abstract setupKernelSpace(): void;
    abstract setupKernelTerminationHook(): void;

    public log(...args: any[]) {
        console.log(`[${this.engine_name}]`, ...args);
    }
}