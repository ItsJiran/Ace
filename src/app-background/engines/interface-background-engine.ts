import { Engine } from '#/shared/engines/engine.ts';

export abstract class InterfaceBackgroundEngine extends Engine {
    private hasRegisteredRpcRoutes = false;

    _registerRpcRoutes() {
        if (this.hasRegisteredRpcRoutes) {
            return;
        }

        this.registerRpcRoutes()
            .then(() => {
                this.hasRegisteredRpcRoutes = true;
                console.log(`[${this.constructor.name}] RPC routes registered successfully.`);
            })
            .catch((error) => {
                console.error(`[${this.constructor.name}] Failed to register RPC routes.`, error);
            });
    }

    abstract registerRpcRoutes(): Promise<void>;
}
