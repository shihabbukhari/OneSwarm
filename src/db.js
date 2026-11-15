import fs from 'node:fs';
import path from 'node:path';

function schema(dialect) {
  const longText = dialect === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
  return {
    tables: [
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(32) PRIMARY KEY,
        github_id VARCHAR(64) NOT NULL UNIQUE,
        login VARCHAR(64) NOT NULL,
        login_lower VARCHAR(64) NOT NULL UNIQUE,
        display_name VARCHAR(80) NOT NULL,
        avatar_url VARCHAR(500) NOT NULL DEFAULT '',
        country_code VARCHAR(2) NOT NULL DEFAULT '',
        tip_patreon VARCHAR(300) NOT NULL DEFAULT '',
        tip_github VARCHAR(300) NOT NULL DEFAULT '',
        tip_kofi VARCHAR(300) NOT NULL DEFAULT '',
        tip_bmc VARCHAR(300) NOT NULL DEFAULT '',
        role VARCHAR(16) NOT NULL DEFAULT 'user',
        banned_at VARCHAR(40) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(32) NOT NULL,
        csrf_token VARCHAR(64) NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(32) PRIMARY KEY,
        user_id VARCHAR(32) NOT NULL,
        name VARCHAR(80) NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        token_prefix VARCHAR(24) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        last_used_at VARCHAR(40) NOT NULL DEFAULT '',
        revoked_at VARCHAR(40) NOT NULL DEFAULT '',
        about VARCHAR(280) NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS missions (
        id VARCHAR(32) PRIMARY KEY,
        public_number INTEGER NOT NULL DEFAULT 0,
        title VARCHAR(200) NOT NULL,
        summary VARCHAR(400) NOT NULL DEFAULT '',
        goal ${longText} NOT NULL,
        license VARCHAR(40) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        repo_owner VARCHAR(80) NOT NULL,
        repo_name VARCHAR(120) NOT NULL,
        repo_url VARCHAR(300) NOT NULL,
        default_branch VARCHAR(120) NOT NULL DEFAULT 'main',
        checker_workflow VARCHAR(80) NOT NULL,
        checker_name VARCHAR(120) NOT NULL,
        status VARCHAR(16) NOT NULL,
        poster_user_id VARCHAR(32) NOT NULL,
        reward_amount VARCHAR(40) NOT NULL DEFAULT '',
        reward_currency VARCHAR(12) NOT NULL DEFAULT '',
        reward_rules VARCHAR(1000) NOT NULL DEFAULT '',
        deadline VARCHAR(40) NOT NULL DEFAULT '',
        score_order VARCHAR(8) NOT NULL DEFAULT 'higher',
        problem ${longText} NOT NULL,
        winner_user_id VARCHAR(32) NOT NULL DEFAULT '',
        reward_received_at VARCHAR(40) NOT NULL DEFAULT '',
        spec_json ${longText} NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        approved_at VARCHAR(40) NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS pieces (
        id VARCHAR(32) PRIMARY KEY,
        mission_id VARCHAR(32) NOT NULL,
        piece_key VARCHAR(80) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description VARCHAR(2000) NOT NULL DEFAULT '',
        paths_json ${longText} NOT NULL,
        status VARCHAR(16) NOT NULL,
        claim_user_id VARCHAR(32) NOT NULL DEFAULT '',
        claim_agent_id VARCHAR(32) NOT NULL DEFAULT '',
        claim_expires_at VARCHAR(40) NOT NULL DEFAULT '',
        submit_expires_at VARCHAR(40) NOT NULL DEFAULT '',
        passed_at VARCHAR(40) NOT NULL DEFAULT '',
        passed_by_user_id VARCHAR(32) NOT NULL DEFAULT '',
        passed_country VARCHAR(2) NOT NULL DEFAULT '',
        UNIQUE (mission_id, piece_key)
      )`,
      `CREATE TABLE IF NOT EXISTS submissions (
        id VARCHAR(32) PRIMARY KEY,
        mission_id VARCHAR(32) NOT NULL,
        piece_key VARCHAR(80) NOT NULL DEFAULT '',
        user_id VARCHAR(32) NOT NULL,
        agent_id VARCHAR(32) NOT NULL DEFAULT '',
        pr_number INTEGER NOT NULL,
        pr_url VARCHAR(400) NOT NULL DEFAULT '',
        head_sha VARCHAR(64) NOT NULL DEFAULT '',
        status VARCHAR(24) NOT NULL,
        rejection_reason VARCHAR(500) NOT NULL DEFAULT '',
        score VARCHAR(40) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(32) PRIMARY KEY,
        mission_id VARCHAR(32) NOT NULL DEFAULT '',
        user_id VARCHAR(32) NOT NULL DEFAULT '',
        agent_id VARCHAR(32) NOT NULL DEFAULT '',
        country_code VARCHAR(2) NOT NULL DEFAULT '',
        kind VARCHAR(40) NOT NULL,
        message VARCHAR(400) NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(32) PRIMARY KEY,
        mission_id VARCHAR(32) NOT NULL,
        reporter_user_id VARCHAR(32) NOT NULL,
        reason VARCHAR(1000) NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id VARCHAR(80) PRIMARY KEY,
        event_name VARCHAR(80) NOT NULL,
        received_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS points (
        id VARCHAR(32) PRIMARY KEY,
        user_id VARCHAR(32) NOT NULL,
        agent_id VARCHAR(32) NOT NULL,
        mission_id VARCHAR(32) NOT NULL,
        piece_key VARCHAR(80) NOT NULL DEFAULT '',
        kind VARCHAR(16) NOT NULL,
        amount INTEGER NOT NULL,
        ref_id VARCHAR(32) NOT NULL UNIQUE,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS help_requests (
        id VARCHAR(32) PRIMARY KEY,
        mission_id VARCHAR(32) NOT NULL,
        piece_key VARCHAR(80) NOT NULL,
        asker_user_id VARCHAR(32) NOT NULL,
        asker_agent_id VARCHAR(32) NOT NULL,
        question VARCHAR(1000) NOT NULL,
        context ${longText} NOT NULL,
        status VARCHAR(16) NOT NULL,
        accepted_answer_id VARCHAR(32) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        resolved_at VARCHAR(40) NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS help_answers (
        id VARCHAR(32) PRIMARY KEY,
        request_id VARCHAR(32) NOT NULL,
        helper_user_id VARCHAR(32) NOT NULL,
        helper_agent_id VARCHAR(32) NOT NULL,
        body ${longText} NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        UNIQUE (request_id, helper_agent_id)
      )`,
      `CREATE TABLE IF NOT EXISTS installations (
        repo_owner VARCHAR(80) NOT NULL,
        repo_name VARCHAR(120) NOT NULL,
        installation_id VARCHAR(32) NOT NULL,
        PRIMARY KEY (repo_owner, repo_name)
      )`,
    ],
    // Columns added after the first release. Older databases get them on start.
    columns: [
      dialect === 'postgres'
        ? `ALTER TABLE agents ADD COLUMN IF NOT EXISTS about VARCHAR(280) NOT NULL DEFAULT ''`
        : `ALTER TABLE agents ADD COLUMN about VARCHAR(280) NOT NULL DEFAULT ''`,
    ],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_agents_user ON agents (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_missions_status ON missions (status)',
      'CREATE INDEX IF NOT EXISTS idx_missions_repo ON missions (repo_owner, repo_name)',
      'CREATE INDEX IF NOT EXISTS idx_pieces_mission ON pieces (mission_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_pr ON submissions (mission_id, pr_number)',
      'CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at)',
      'CREATE INDEX IF NOT EXISTS idx_points_agent ON points (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_points_user ON points (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_help_status ON help_requests (status, expires_at)',
    ],
  };
}

function plain(row) {
  if (!row) return null;
  return { ...row };
}

function createMutex() {
  let chain = Promise.resolve();
  return function enqueue(work) {
    const run = chain.then(work);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };
}

function packRun(result) {
  if (!result) return { changes: 0 };
  return { changes: Number(result.changes ?? result.affectedRows ?? 0) };
}

async function openSqlite(location) {
  const { DatabaseSync } = await import('node:sqlite');
  let filename = location || ':memory:';
  if (filename !== ':memory:' && !path.isAbsolute(filename)) {
    filename = path.resolve(filename);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const raw = new DatabaseSync(filename);
  if (filename !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  const enqueue = createMutex();
  const db = {
    dialect: 'sqlite',
    async close() {
      raw.close();
    },
    async exec(sql) {
      return enqueue(() => {
        raw.exec(sql);
      });
    },
    async all(sql, params = []) {
      return enqueue(() => raw.prepare(sql).all(...params).map((row) => plain(row)));
    },
    async get(sql, params = []) {
      return enqueue(() => plain(raw.prepare(sql).get(...params)));
    },
    async run(sql, params = []) {
      return enqueue(() => packRun(raw.prepare(sql).run(...params)));
    },
  };
  db.transaction = async (fn) =>
    enqueue(async () => {
      raw.exec('BEGIN IMMEDIATE');
      const tx = {
        all: async (sql, params = []) => raw.prepare(sql).all(...params).map((row) => plain(row)),
        get: async (sql, params = []) => plain(raw.prepare(sql).get(...params)),
        run: async (sql, params = []) => packRun(raw.prepare(sql).run(...params)),
      };
      try {
        const value = await fn(tx);
        raw.exec('COMMIT');
        return value;
      } catch (error) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          // The connection may already have rolled back.
        }
        throw error;
      }
    });
  return db;
}

async function openMysql(url) {
  const mysql = (await import('mysql2/promise')).default;
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: Number(process.env.DATABASE_POOL_MAX || 3),
    waitForConnections: true,
    charset: 'utf8mb4',
    decimalNumbers: true,
  });
  const enqueue = createMutex();
  async function query(conn, sql, params = []) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }
  const db = {
    dialect: 'mysql',
    async close() {
      await pool.end();
    },
    async exec(sql) {
      return enqueue(async () => {
        await pool.query(sql);
      });
    },
    async all(sql, params = []) {
      return enqueue(async () => {
        const rows = await query(pool, sql, params);
        return rows.map((row) => plain(row));
      });
    },
    async get(sql, params = []) {
      return enqueue(async () => {
        const rows = await query(pool, sql, params);
        return plain(rows[0]);
      });
    },
    async run(sql, params = []) {
      return enqueue(async () => packRun(await query(pool, sql, params)));
    },
  };
  db.transaction = async (fn) =>
    enqueue(async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const tx = {
          all: async (sql, params = []) => (await query(conn, sql, params)).map((row) => plain(row)),
          get: async (sql, params = []) => plain((await query(conn, sql, params))[0]),
          run: async (sql, params = []) => packRun(await query(conn, sql, params)),
        };
        const value = await fn(tx);
        await conn.commit();
        return value;
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          // Ignore a rollback failure and surface the original error.
        }
        throw error;
      } finally {
        conn.release();
      }
    });
  return db;
}

// The app writes SQL with ? placeholders. Postgres wants $1, $2, ... (quoted text is left alone).
export function toPostgres(sql) {
  let out = '';
  let n = 0;
  let quoted = false;
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    if (ch === '?' && !quoted) {
      n += 1;
      out += `$${n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function wrapPostgres({ run: execute, exec, transaction, close }) {
  const enqueue = createMutex();
  const shape = (result) => ({
    rows: (result.rows || []).map((row) => plain(row)),
    changes: Number(result.rowCount ?? result.affectedRows ?? 0),
  });
  const runner = (fn) => ({
    all: async (sql, params = []) => shape(await fn(toPostgres(sql), params)).rows,
    get: async (sql, params = []) => shape(await fn(toPostgres(sql), params)).rows[0] || null,
    run: async (sql, params = []) => ({ changes: shape(await fn(toPostgres(sql), params)).changes }),
  });
  const direct = runner(execute);
  return {
    dialect: 'postgres',
    close,
    exec: (sql) => enqueue(() => exec(sql)),
    all: (sql, params) => enqueue(() => direct.all(sql, params)),
    get: (sql, params) => enqueue(() => direct.get(sql, params)),
    run: (sql, params) => enqueue(() => direct.run(sql, params)),
    transaction: (fn) => enqueue(() => transaction((query) => fn(runner(query)))),
  };
}

async function openPostgres(url) {
  const { default: pg } = await import('pg');
  // Counts and sums come back as numbers, the same as SQLite and MySQL.
  pg.types.setTypeParser(20, (value) => Number(value));
  pg.types.setTypeParser(1700, (value) => Number(value));
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  return wrapPostgres({
    run: (sql, params) => pool.query(sql, params),
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn((sql, params) => client.query(sql, params));
        await client.query('COMMIT');
        return value;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Surface the original error.
        }
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
}

// In-memory Postgres for tests (npm run test:pg). Not used in production.
async function openPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const parsers = { 20: (value) => Number(value), 1700: (value) => Number(value) };
  const pglite = new PGlite({ parsers });
  return wrapPostgres({
    run: (sql, params) => pglite.query(sql, params),
    exec: async (sql) => {
      await pglite.exec(sql);
    },
    transaction: (fn) => pglite.transaction((tx) => fn((sql, params) => tx.query(sql, params))),
    close: () => pglite.close(),
  });
}

export async function openDatabase(databaseUrl) {
  if (databaseUrl.startsWith('mysql://')) return openMysql(databaseUrl);
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) return openPostgres(databaseUrl);
  if (databaseUrl === 'pglite:memory') return openPglite();
  if (databaseUrl.startsWith('sqlite:')) return openSqlite(databaseUrl.slice('sqlite:'.length));
  throw new Error('DATABASE_URL must start with sqlite:, mysql://, postgres://, or postgresql://');
}

// Bump this whenever schema() changes. A serverless cold start then needs one query, not twenty.
export const SCHEMA_VERSION = '2026-11-15.1';

export async function migrate(db) {
  try {
    const row = await db.get('SELECT version FROM schema_meta WHERE id = 1');
    if (row && row.version === SCHEMA_VERSION) return { skipped: true };
  } catch {
    // The table does not exist yet. Run the full migration below.
  }
  const { tables, columns, indexes } = schema(db.dialect);
  for (const sql of tables) await db.exec(sql);
  for (const sql of columns) {
    try {
      await db.exec(sql);
    } catch (error) {
      if (!/duplicate column|already exists/i.test(String(error.message))) throw error;
    }
  }
  for (const raw of indexes) {
    // MySQL 8 has no CREATE INDEX IF NOT EXISTS. Create it plainly and ignore "Duplicate key name".
    const sql = db.dialect === 'mysql' ? raw.replace('CREATE INDEX IF NOT EXISTS', 'CREATE INDEX') : raw;
    try {
      await db.exec(sql);
    } catch (error) {
      if (!/exists|duplicate/i.test(String(error.message))) throw error;
    }
  }
  await db.exec('CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version VARCHAR(40) NOT NULL)');
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM schema_meta WHERE id = 1');
    await tx.run('INSERT INTO schema_meta (id, version) VALUES (1, ?)', [SCHEMA_VERSION]);
  });
  return { skipped: false };
}
