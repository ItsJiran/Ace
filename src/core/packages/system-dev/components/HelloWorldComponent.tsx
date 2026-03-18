export function HelloWorldComponent() {
    return (
        <div className="w-full h-full bg-zinc-950 text-zinc-100 p-6 flex items-center justify-center">
            <div className="max-w-md w-full rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 shadow-lg">
                <h2 className="text-xl font-semibold text-emerald-300">Hello World Package</h2>
                <p className="mt-2 text-sm text-zinc-300">
                    This window is rendered from <code>example/packages/example-package/registry.json</code>.
                </p>
                <p className="mt-4 text-xs text-zinc-500">Component: <code>hello_world_component</code></p>
            </div>
        </div>
    );
}
