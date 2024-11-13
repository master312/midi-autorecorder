// src/models/database.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

class Database {
    constructor() {
        this.db = null;
    }

    async initialize() {
        try {
            this.db = await open({
                filename: "midi_recorder.db",
                driver: sqlite3.Database
            });

            await this.createTables();
            console.log('INFO: Database initialized successfully');
        } catch (error) {
            console.log('ERROR: Database initialization failed:', error);
            throw error;
        }
    }

    async createTables() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS recordings (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                device_name TEXT NOT NULL,
                duration INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                file_size INTEGER,
                midi_events_count INTEGER
            );
        `);
    }

    async getDb() {
        if (!this.db) {
            await this.initialize();
        }
        return this.db;
    }
}

module.exports = new Database();
