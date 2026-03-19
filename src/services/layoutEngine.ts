import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { WindowEngine } from './windowEngine';
import { FSEngine } from './fsEngine';
import type { LayoutSnapshot, WindowLayoutEntry } from '#/schemas/layout';
import { LayoutSnapshotSchema } from '#/schemas/layout';

/**
 * LayoutEngineSingleton
 * Orchestrates the snapshotting (Save) and rehydration (Load) of Window Layouts.
 * 
 * Responsibilities:
 * 1. Gather state from all active windows.
 * 2. Serialize state to JSON file.
 * 3. Deserialize JSON and spawn windows.
 * 4. Manage available layouts list.
 */
class LayoutEngineSingleton {
    private readonly LAYOUTS_DIR = 'layouts'; // Removed .ace prefix to avoid forbidden path issues
    private activeLayoutUid?: string;

    /**
     * Initializes the Layout Engine.
     * Ensures the layouts directory exists.
     */
    async init() {
        // Ensure directory exists
        // Note: fsEngine.ensureDir is assumed to exist, or we check existence
        try {
            const success = await FSEngine.createDirectory(this.LAYOUTS_DIR);
            
            if (success) {
                console.log(`[LayoutEngine] Initialized at ${this.LAYOUTS_DIR}`);
                await this.refreshAvailableLayouts();
            } else {
                 console.warn(`[LayoutEngine] Failed to create layout dir at ${this.LAYOUTS_DIR}`);
            }
        } catch (error) {
            console.warn(`[LayoutEngine] Failed to init layout dir:`, error);
        }
    }

    /**
     * Snapshots the current window state and saves it to a JSON file.
     * @param name The display name of the layout
     */
    async saveLayout(name: string) {
        const windows = StorageEngine.readMemory('system:windows') as Record<string, any>;
        if (!windows) {
            console.warn('[LayoutEngine] No windows to save.');
            return;
        }

        const entries: WindowLayoutEntry[] = [];

        // 1. Iterate over all active windows in RAM
        for (const [window_uid, winConfig] of Object.entries(windows)) {
            // Skip ephemeral/tooltip windows if necessary
            if (winConfig.is_ephemeral) continue;

            // Future: Request detailed widget state via EventBus (REQUEST_SNAPSHOT)
            // For now, we save basic window props
            
            const entry: WindowLayoutEntry = {
                window_uid: `restored-${crypto.randomUUID()}`, // New UID for next load vs preserving? Preserving might be better for state.
                component_name: winConfig.component_name || 'UnknownWidget',
                bounds: {
                    x: winConfig.x,
                    y: winConfig.y,
                    width: winConfig.width,
                    height: winConfig.height
                },
                visual_state: {
                    z_index: winConfig.z_index,
                    opacity: winConfig.opacity || 1,
                    is_locked: winConfig.is_locked || false,
                    always_on_top: winConfig.always_on_top || false
                },
                restoration_strategy: 'restore_state',
                // payload: winConfig.payload // Capture initial payload?
            };
            
            entries.push(entry);
        }

        const snapshot: LayoutSnapshot = {
            layout_uid: crypto.randomUUID(),
            name,
            version: '1.0.0',
            created_at: Date.now(),
            updated_at: Date.now(),
            windows: entries,
            // environment_overrides: {} // Populate from ConfigEngine if needed
        };

        // Validate Schema before write
        const validSnapshot = LayoutSnapshotSchema.parse(snapshot);

        // serialize
        const filename = `${name.toLowerCase().replace(/\s+/g, '_')}.json`;
        const filePath = `${this.LAYOUTS_DIR}/${filename}`;

        await FSEngine.writeFile(filePath, JSON.stringify(validSnapshot, null, 2));
        console.log(`[LayoutEngine] Saved layout "${name}" to ${filePath}`);

        await this.refreshAvailableLayouts();
        return validSnapshot;
    }

    /**
     * Loads a layout from a file and spawns the windows.
     * @param filename "dev_mode.json" or just "dev_mode"
     */
    async loadLayout(layoutNameOrPath: string) {
        let filePath = layoutNameOrPath;
        if (!filePath.endsWith('.json')) {
            // Assume it's a name in the default dir
             const filename = `${layoutNameOrPath.toLowerCase().replace(/\s+/g, '_')}.json`;
             filePath = `${this.LAYOUTS_DIR}/${filename}`;
        }

        console.log(`[LayoutEngine] Loading layout from ${filePath}...`);
        
        try {
            const content = await FSEngine.readFile(filePath);
            const rawJson = JSON.parse(content);
            const snapshot = LayoutSnapshotSchema.parse(rawJson);

            // 1. Close current windows (Optional: Strategy argument 'merge' vs 'replace')
            await WindowEngine.closeAllWindows(); 

            // 2. Iterate and Spawn
            for (const entry of snapshot.windows) {
                // Emit open_window intent
                EventBus.emit({
                    event_type: 'interaction',
                    action: 'open_window',
                    payload: {
                        component_name: entry.component_name,
                        // Flatten bounds for WindowEngine compatibility
                        x: entry.bounds.x,
                        y: entry.bounds.y,
                        width: entry.bounds.width,
                        height: entry.bounds.height,
                        // Flatten visual state
                        z_index: entry.visual_state.z_index,
                        opacity: entry.visual_state.opacity,
                        is_locked: entry.visual_state.is_locked,
                        always_on_top: entry.visual_state.always_on_top,
                        // Pass payload
                        payload: entry.payload, 
                        // Attach restoration strategy metadata if needed by window
                        restoration_strategy: entry.restoration_strategy
                    }
                });
            }

            this.activeLayoutUid = snapshot.layout_uid;
            console.log(`[LayoutEngine] Layout "${snapshot.name}" loaded successfully.`);

        } catch (error) {
            console.error(`[LayoutEngine] Failed to load layout:`, error);
            throw error;
        }
    }

    /**
     * Scans the layout directory and updates RAM with available save files.
     */
    async refreshAvailableLayouts() {
        try {
            const files = await FSEngine.readDirectory(this.LAYOUTS_DIR);
            const layoutFiles = files.filter(f => f.name.endsWith('.json'));
            
            // Write to RAM for UI to display list
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:available_layouts',
                payload: layoutFiles.map(f => ({ name: f.name, path: f.path })),
                classifications: ['system:layouts']
            });
        } catch (error) {
            // dir might not exist yet
        }
    }
}

export const LayoutEngine = new LayoutEngineSingleton();
