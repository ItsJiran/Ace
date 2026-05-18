export abstract class Engine {

    private isBoot = false;
    private isKernelInitialized = false;
    private isEventRouteInitialized = false;

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

    abstract boot(): void;
    abstract setupKernelSpace(): void;
    abstract setupEventRoutes(): void;
}