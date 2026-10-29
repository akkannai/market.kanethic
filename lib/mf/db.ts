import mysql from 'mysql2/promise';

// MySQL / MariaDB (Hostinger). Env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
let pool: mysql.Pool | undefined;

export class DbNotConfigured extends Error {
  constructor() { super('Database not configured (set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)'); }
}

export function db(): mysql.Pool {
  if (!pool) {
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) throw new DbNotConfigured();
    pool = mysql.createPool({
      host: DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: DB_USER, password: DB_PASSWORD ?? '', database: DB_NAME,
      connectionLimit: Number(process.env.DB_POOL) || 6, waitForConnections: true, charset: 'utf8mb4',
      dateStrings: true, decimalNumbers: true, timezone: 'Z', connectTimeout: 10_000, enableKeepAlive: true,
    });
  }
  return pool;
}

export async function q<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T[]> {
  await ready();
  const [rows] = await db().query(sql, params);
  return rows as T[];
}
export async function exec(sql: string, params: any[] = []) {
  await ready();
  const [res] = await db().query(sql, params);
  return res as mysql.ResultSetHeader;
}
/** Bulk insert: rows = array of arrays, sql ma `VALUES ?` */
export async function bulk(sql: string, rows: any[][], chunk = 1000) {
  await ready();
  for (let i = 0; i < rows.length; i += chunk) await db().query(sql, [rows.slice(i, i + chunk)]);
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schemes (
    scheme_code INT UNSIGNED NOT NULL PRIMARY KEY,
    isin_a VARCHAR(12) NULL, isin_b VARCHAR(12) NULL,
    name VARCHAR(300) NOT NULL, amc VARCHAR(160) NOT NULL,
    scheme_type VARCHAR(20) NOT NULL, main_category VARCHAR(80) NOT NULL, sub_category VARCHAR(120) NOT NULL,
    category VARCHAR(200) NOT NULL, category_slug VARCHAR(130) NOT NULL,
    plan ENUM('Regular','Direct') NOT NULL, opt ENUM('Growth','IDCW','Bonus','Other') NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1, first_seen DATE NOT NULL, last_seen DATE NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_amc (amc), KEY idx_cat (category_slug), KEY idx_main (main_category), KEY idx_plan_opt (plan, opt), KEY idx_isin (isin_a), KEY idx_active (active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS nav_history (
    scheme_code INT UNSIGNED NOT NULL, nav_date DATE NOT NULL, nav DECIMAL(14,4) NOT NULL,
    source ENUM('amfi','mfapi','manual') NOT NULL DEFAULT 'amfi',
    PRIMARY KEY (scheme_code, nav_date), KEY idx_date (nav_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS nav_latest (
    scheme_code INT UNSIGNED NOT NULL PRIMARY KEY, nav_date DATE NOT NULL, nav DECIMAL(14,4) NOT NULL,
    prev_date DATE NULL, prev_nav DECIMAL(14,4) NULL, chg DECIMAL(14,4) NULL, chg_pct DECIMAL(10,4) NULL,
    r1m DECIMAL(10,4) NULL, r3m DECIMAL(10,4) NULL, r6m DECIMAL(10,4) NULL, r1y DECIMAL(10,4) NULL, r3y DECIMAL(10,4) NULL, r5y DECIMAL(10,4) NULL,
    computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_date (nav_date), KEY idx_chg (chg_pct), KEY idx_r1y (r1y)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS category_summary (
    category_slug VARCHAR(130) NOT NULL PRIMARY KEY, category VARCHAR(200) NOT NULL, main_category VARCHAR(80) NOT NULL, sub_category VARCHAR(120) NOT NULL,
    nav_date DATE NULL, scheme_count INT NOT NULL, avg_1d DECIMAL(10,4) NULL, median_1d DECIMAL(10,4) NULL,
    gainers INT NOT NULL DEFAULT 0, losers INT NOT NULL DEFAULT 0, unchanged INT NOT NULL DEFAULT 0, computed_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS job_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, job VARCHAR(40) NOT NULL, slot VARCHAR(10) NULL,
    trigger_by ENUM('cron','manual') NOT NULL, started_at DATETIME NOT NULL, finished_at DATETIME NULL,
    status ENUM('running','ok','nochange','waiting','failed','skipped') NOT NULL, message TEXT NULL, stats TEXT NULL,
    KEY idx_job (job, started_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS job_locks (name VARCHAR(40) NOT NULL PRIMARY KEY, locked_until DATETIME NOT NULL) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS data_status (
    source VARCHAR(60) NOT NULL PRIMARY KEY, data_as_of DATE NULL, last_checked_at DATETIME NULL, last_success_at DATETIME NULL, last_error TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS nav_review (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, scheme_code INT UNSIGNED NOT NULL, nav_date DATE NOT NULL, nav DECIMAL(14,4) NOT NULL,
    prev_date DATE NULL, prev_nav DECIMAL(14,4) NULL, change_pct DECIMAL(10,4) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', created_at DATETIME NOT NULL, reviewed_at DATETIME NULL,
    UNIQUE KEY uq_review (scheme_code, nav_date), KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS backfill_state (
    scheme_code INT UNSIGNED NOT NULL PRIMARY KEY, priority TINYINT NOT NULL DEFAULT 3,
    status ENUM('pending','done','failed','na') NOT NULL DEFAULT 'pending', attempts TINYINT NOT NULL DEFAULT 0,
    last_error VARCHAR(300) NULL, history_from DATE NULL, rows_loaded INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_pick (status, priority, scheme_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS settings (skey VARCHAR(60) NOT NULL PRIMARY KEY, svalue TEXT NULL, updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS scheme_metrics (
    scheme_code INT UNSIGNED NOT NULL PRIMARY KEY, nav_date DATE NOT NULL, rf_pct DECIMAL(6,3) NULL, history_from DATE NULL,
    vol_1y DECIMAL(10,4) NULL, vol_3y DECIMAL(10,4) NULL, vol_5y DECIMAL(10,4) NULL,
    sharpe_1y DECIMAL(10,4) NULL, sharpe_3y DECIMAL(10,4) NULL, sharpe_5y DECIMAL(10,4) NULL, sortino_3y DECIMAL(10,4) NULL,
    mdd_3y DECIMAL(10,4) NULL, mdd_all DECIMAL(10,4) NULL, cur_dd DECIMAL(10,4) NULL, calmar_3y DECIMAL(10,4) NULL,
    roll1y_med DECIMAL(10,4) NULL, roll1y_pos DECIMAL(10,4) NULL, roll3y_med DECIMAL(10,4) NULL, roll3y_pos DECIMAL(10,4) NULL,
    sip3y DECIMAL(10,4) NULL, sip5y DECIMAL(10,4) NULL, computed_at DATETIME NOT NULL,
    KEY idx_sharpe (sharpe_3y), KEY idx_vol (vol_3y)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

let migrating: Promise<void> | undefined;
export function ready(): Promise<void> {
  migrating ??= (async () => {
    for (const s of SCHEMA) await db().query(s);
  })().catch((e) => { migrating = undefined; throw e; });
  return migrating;
}

export const utcNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
