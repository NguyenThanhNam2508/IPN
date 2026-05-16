require('dotenv').config();
const { sql } = require('@vercel/postgres');

async function initDB() {
    try {
        console.log("Checking DB connection...");
        const res = await sql`SELECT NOW()`;
        console.log("Connected to DB at:", res.rows[0].now);

        console.log("Creating table client_keys...");
        await sql`
            CREATE TABLE IF NOT EXISTS client_keys (
                client_id VARCHAR(100) NOT NULL,
                key_id VARCHAR(50) NOT NULL,
                name VARCHAR(255),
                value VARCHAR(255),
                color VARCHAR(50),
                PRIMARY KEY (client_id, key_id)
            );
        `;

        console.log("Creating table ipn_logs...");
        await sql`
            CREATE TABLE IF NOT EXISTS ipn_logs (
                id SERIAL PRIMARY KEY,
                client_id VARCHAR(100) NOT NULL,
                source VARCHAR(255),
                matched_name VARCHAR(255),
                matched_color VARCHAR(50),
                matched_id VARCHAR(50),
                body_obj JSONB,
                created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
            );
        `;
        
        console.log("Tables created successfully!");
    } catch (e) {
        console.error("DB Init error:", e);
    }
}

initDB();
