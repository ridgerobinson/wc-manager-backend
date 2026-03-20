import Postgres from 'pg';

const { Pool } = Postgres;

const poolConfig = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT
});

export async function commitTransaction(pool) {
    return await pool.query('COMMIT');
}

export async function rollbackTransaction(pool) {
    return await pool.query('ROLLBACK');
}

export async function StartPool() {
    return await poolConfig.connect();
}

export async function StartPT() {
    var pool = await poolConfig.connect();
    
    await pool.query('BEGIN');

    return pool;
}

export async function StartTransaction(pool) {
    return await pool.query('BEGIN');
}