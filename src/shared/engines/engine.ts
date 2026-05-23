export abstract class Engine {

    private engine_name = (this.constructor as typeof Engine).name || 'UnnamedEngine';
    private isBoot = false;
    private isKernelInitialized = false;
    private isEventRouteInitialized = false;
    private isRpcRouteInitialized = false;
    private isTerminationHookBound = false;

    async _boot() {
        if(this.isBoot) return;
        await this.boot();
        this.isBoot = true;
    }

    async _setupKernelSpace() {
        if(this.isKernelInitialized) return;
        await this.setupKernelSpace();
        this.isKernelInitialized = true;
    }

    async _setupEventRoutes() {
        if(this.isEventRouteInitialized) return;
        await this.setupEventRoutes();
        this.isEventRouteInitialized = true;
    }

    async _setupRpcRoutes() {
        if(this.isRpcRouteInitialized) return;
        await this.setupRpcRoutes();
        this.isRpcRouteInitialized = true;
    }

    async _setupKernelTerminationHook() {
        if(this.isTerminationHookBound) return;
        await this.setupKernelTerminationHook();
        this.isTerminationHookBound = true;
    }

    abstract boot(): void | Promise<void>;
    abstract setupEventRoutes(): void | Promise<void>;
    setupRpcRoutes(): void | Promise<void> {}
    abstract setupKernelSpace(): void | Promise<void>;
    abstract setupKernelTerminationHook(): void | Promise<void>;

    public log(...args: any[]) {
        console.log(`[${this.engine_name}]`, ...args);
    }
}