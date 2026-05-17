import Database from '@tauri-apps/plugin-sql';

class DBEngineSingleton {
    private db: Database | null = null;
    private dbName = 'sqlite:ace_audit.db'; // Renamed to reflect audit purpose

    /**
     * Initializes the database connection and creates tables for auditing and tracking.
     */
    async init() {
        if (this.db) return this.db;

        try {
            this.db = await Database.load(this.dbName);
            await this.setupTables();
            console.log('Audit Database initialized successfully.');
            return this.db;
        } catch (error) {
            console.error('Failed to initialize audit database:', error);
            throw error;
        }
    }

    private async setupTables() {
        if (!this.db) return;

        // 1. Event Tickets Audit (Interactions & Listeners)
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS events_tickets_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interaction_uid TEXT,
                event_type TEXT NOT NULL, -- interaction | listener
                action TEXT,
                sub_action TEXT,
                status TEXT NOT NULL, -- success | error | pending
                payload TEXT,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Process Audits (Error tracking for background processes)
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS process_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                process_uid TEXT NOT NULL,
                worker_type TEXT,
                error_message TEXT NOT NULL,
                stack_trace TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Workers (Polymorphic tracking for active widget/system workers)
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS workers (
                worker_uid TEXT PRIMARY KEY,
                worker_type TEXT NOT NULL, -- e.g. 'widget', 'system', 'parser'
                target_uid TEXT, -- e.g. widget_uid or system_service_name
                status TEXT NOT NULL, -- idle | running | error
                last_run_at DATETIME,
                config_snapshot TEXT -- Optional: snapshot of config at runtime
            )
        `);

        // 4. Worker Audit Logs
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS worker_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_uid TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(worker_uid) REFERENCES workers(worker_uid)
            )
        `);

        // 5. Schedulers (Cron-like background tasks)
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS schedulers (
                scheduler_uid TEXT PRIMARY KEY,
                description TEXT,
                run_every_ms INTEGER NOT NULL,
                last_runtime DATETIME,
                status TEXT NOT NULL, -- active | paused | error
                params TEXT -- JSON configuration for the task
            )
        `);

        // 6. Scheduler Audit Logs
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS scheduler_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scheduler_uid TEXT NOT NULL,
                execution_time_ms INTEGER,
                status TEXT NOT NULL, -- success | failure
                result_info TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(scheduler_uid) REFERENCES schedulers(scheduler_uid)
            )
        `);
    }

    // ==========================================
    // 📖 AUDIT LOGGING METHODS
    // ==========================================

    async logProcessError(process_uid: string, error: string, stack?: string, worker_type?: string) {
        if (!this.db) await this.init();
        await this.db!.execute(
            'INSERT INTO process_audits (process_uid, worker_type, error_message, stack_trace) VALUES ($1, $2, $3, $4)',
            [process_uid, worker_type || null, error, stack || null]
        );
    }

    async logEventAudit(event: {
        interaction_uid?: string;
        event_type: string;
        action?: string;
        sub_action?: string;
        status: string;
        payload?: any;
        error?: string;
    }) {
        if (!this.db) await this.init();
        await this.db!.execute(
            'INSERT INTO events_tickets_audits (interaction_uid, event_type, action, sub_action, status, payload, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [
                event.interaction_uid || null,
                event.event_type,
                event.action || null,
                event.sub_action || null,
                event.status,
                event.payload ? JSON.stringify(event.payload) : null,
                event.error || null
            ]
        );
    }

    // ==========================================
    // 💾 WORKER & SCHEDULER SYNC
    // ==========================================

    async syncWorker(worker: { uid: string; type: string; target?: string; status: string }) {
        if (!this.db) await this.init();
        await this.db!.execute(
            'INSERT INTO workers (worker_uid, worker_type, target_uid, status, last_run_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT(worker_uid) DO UPDATE SET status = EXCLUDED.status, last_run_at = CURRENT_TIMESTAMP',
            [worker.uid, worker.type, worker.target || null, worker.status]
        );
    }

    async updateSchedulerStatus(uid: string, result: { status: string; duration?: number; info?: string }) {
        if (!this.db) await this.init();
        // Update main table
        await this.db!.execute(
            'UPDATE schedulers SET last_runtime = CURRENT_TIMESTAMP, status = $1 WHERE scheduler_uid = $2',
            [result.status === 'success' ? 'active' : 'error', uid]
        );
        // Add audit entry
        await this.db!.execute(
            'INSERT INTO scheduler_audits (scheduler_uid, execution_time_ms, status, result_info) VALUES ($1, $2, $3, $4)',
            [uid, result.duration || 0, result.status, result.info || null]
        );
    }
}

export const DBEngine = new DBEngineSingleton();

