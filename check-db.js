require('dotenv').config();
const { sql } = require('@vercel/postgres');

async function check() {
    try {
        console.log("Checking DB connection...");
        const res = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log("Tables in public schema:");
        res.rows.forEach(row => console.log(`- ${row.table_name}`));
        
        // Count rows in each table
        if (res.rows.find(r => r.table_name === 'client_keys')) {
            const countKeys = await sql`SELECT COUNT(*) FROM client_keys`;
            console.log(`\nclient_keys has ${countKeys.rows[0].count} rows`);
        }
        if (res.rows.find(r => r.table_name === 'ipn_logs')) {
            const countLogs = await sql`SELECT COUNT(*) FROM ipn_logs`;
            console.log(`ipn_logs has ${countLogs.rows[0].count} rows`);
        }
        
        process.exit(0);
    } catch(e) {
        console.error("DB Init error:", e);
        process.exit(1);
    }
}
check();
