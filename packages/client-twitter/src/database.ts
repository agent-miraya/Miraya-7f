import pg from "pg";

const pool = new pg.Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432, // default PostgreSQL port
    ssl: {
        rejectUnauthorized: false,
    },
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

const createLeaderboardTable = async () => {
    const createTableQuery = `

        CREATE TABLE IF NOT EXISTS leaderboard (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL,
            rank INTEGER NOT NULL,
            username TEXT NOT NULL,
            score INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE leaderboard
            ALTER COLUMN score TYPE FLOAT;
    `;
    await query(createTableQuery);
};

createLeaderboardTable().catch((err) =>
    console.error("Error creating leaderboard table:", err)
);
