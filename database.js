const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const isPostgres = Boolean(process.env.DATABASE_URL);
if (process.env.NODE_ENV === 'production' && !isPostgres) {
  throw new Error('DATABASE_URL es obligatorio en producción; configure PostgreSQL antes de iniciar el servicio');
}

const sqliteSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS Usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
    carnet TEXT,
    correo TEXT,
    telefono TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('estudiante_tecnico','cursos_libres','personal_administrativo','otro')),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo')),
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS UX_Usuarios_Carnet ON Usuarios(carnet COLLATE NOCASE) WHERE carnet IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS UX_Usuarios_Correo ON Usuarios(correo COLLATE NOCASE) WHERE correo IS NOT NULL;

  CREATE TABLE IF NOT EXISTS Cuentas (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    nombre TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','BIBLIOTECARIA','PRESTATARIO')),
    reader_id INTEGER UNIQUE REFERENCES Usuarios(id),
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS Sesiones (
    token_hash TEXT PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES Cuentas(id) ON DELETE CASCADE,
    expira_en INTEGER NOT NULL,
    creado_en INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS IX_Sesiones_Cuenta ON Sesiones(cuenta_id);

  CREATE TABLE IF NOT EXISTS Libros (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL COLLATE NOCASE UNIQUE,
    titulo TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 200),
    autor TEXT NOT NULL CHECK (length(trim(autor)) BETWEEN 1 AND 160),
    categoria TEXT,
    copias_totales INTEGER NOT NULL CHECK (copias_totales > 0),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo')),
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS Prestamos (
    id INTEGER PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES Usuarios(id),
    libro_id INTEGER NOT NULL REFERENCES Libros(id),
    fecha_prestamo TEXT NOT NULL,
    fecha_limite TEXT NOT NULL,
    fecha_devolucion TEXT,
    dias_mora INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('Activo','Devuelto')),
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS IX_Prestamos_Activos ON Prestamos(estado, fecha_limite);
  CREATE TABLE IF NOT EXISTS Notificaciones (
    id INTEGER PRIMARY KEY,
    prestamo_id INTEGER NOT NULL UNIQUE REFERENCES Prestamos(id),
    canal TEXT NOT NULL CHECK (canal IN ('correo','telefono','sin_contacto')),
    destino TEXT,
    mensaje TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('Pendiente (demo)','Sin contacto')),
    creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
    carnet TEXT,
    correo TEXT,
    telefono TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('estudiante_tecnico','cursos_libres','personal_administrativo','otro')),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo')),
    creado_en TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_carnet ON usuarios(lower(carnet)) WHERE carnet IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_correo ON usuarios(lower(correo)) WHERE correo IS NOT NULL;

  CREATE TABLE IF NOT EXISTS cuentas (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    nombre TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','BIBLIOTECARIA','PRESTATARIO')),
    reader_id INTEGER UNIQUE REFERENCES usuarios(id),
    creado_en TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_username ON cuentas(lower(username));
  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    expira_en BIGINT NOT NULL,
    creado_en BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_sesiones_cuenta ON sesiones(cuenta_id);

  CREATE TABLE IF NOT EXISTS libros (
    id SERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 200),
    autor TEXT NOT NULL CHECK (length(trim(autor)) BETWEEN 1 AND 160),
    categoria TEXT,
    copias_totales INTEGER NOT NULL CHECK (copias_totales > 0),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo')),
    creado_en TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_libros_codigo ON libros(lower(codigo));
  CREATE TABLE IF NOT EXISTS prestamos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    libro_id INTEGER NOT NULL REFERENCES libros(id),
    fecha_prestamo TEXT NOT NULL,
    fecha_limite TEXT NOT NULL,
    fecha_devolucion TEXT,
    dias_mora INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('Activo','Devuelto')),
    creado_en TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  CREATE INDEX IF NOT EXISTS ix_prestamos_activos ON prestamos(estado, fecha_limite);
  CREATE TABLE IF NOT EXISTS notificaciones (
    id SERIAL PRIMARY KEY,
    prestamo_id INTEGER NOT NULL UNIQUE REFERENCES prestamos(id),
    canal TEXT NOT NULL CHECK (canal IN ('correo','telefono','sin_contacto')),
    destino TEXT,
    mensaje TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('Pendiente (demo)','Sin contacto')),
    creado_en TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
`;

const sqlitePath = process.env.BIBLIOTECA_DB_PATH || path.join(__dirname, 'data', 'biblioteca.sqlite');
if (!isPostgres && sqlitePath !== ':memory:') {
  fs.mkdirSync(path.dirname(path.resolve(sqlitePath)), { recursive: true });
}
const sqlite = isPostgres ? null : new DatabaseSync(sqlitePath);
const { Pool } = isPostgres ? require('pg') : {};
const pool = isPostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PGPOOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
}) : null;
if (pool) {
  pool.on('error', (error) => console.error('Error inesperado en el pool de PostgreSQL:', error));
}

function prepareSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createExecutor(client) {
  async function query(sql, params = []) {
    if (isPostgres) {
      const result = await client.query(prepareSql(sql), params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    }

    const statement = client.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...params);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...params);
    return { rows: [], rowCount: result.changes };
  }

  return {
    async all(sql, ...params) {
      return (await query(sql, params)).rows;
    },
    async get(sql, ...params) {
      return (await query(sql, params)).rows[0];
    },
    async run(sql, ...params) {
      const result = await query(sql, params);
      const inserted = result.rows[0];
      return {
        changes: result.rowCount,
        lastInsertRowid: inserted?.id == null ? undefined : Number(inserted.id),
        rows: result.rows
      };
    }
  };
}

const executor = createExecutor(isPostgres ? pool : sqlite);
const db = {
  ...executor,
  type: isPostgres ? 'postgres' : 'sqlite',
  prepare: sqlite?.prepare.bind(sqlite),
  async initialize() {
    if (isPostgres) {
      await pool.query(postgresSchema);
      await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT');
      await pool.query('ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS dias_mora INTEGER NOT NULL DEFAULT 0');
      await pool.query("ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS nombre TEXT NOT NULL DEFAULT ''");
      await pool.query("UPDATE cuentas SET nombre = username WHERE nombre = ''");
      return;
    }
    sqlite.exec(sqliteSchema);
    if (!sqlite.prepare('PRAGMA table_info(Usuarios)').all().some((column) => column.name === 'telefono')) {
      sqlite.exec('ALTER TABLE Usuarios ADD COLUMN telefono TEXT');
    }
    if (!sqlite.prepare('PRAGMA table_info(Prestamos)').all().some((column) => column.name === 'dias_mora')) {
      sqlite.exec('ALTER TABLE Prestamos ADD COLUMN dias_mora INTEGER NOT NULL DEFAULT 0');
    }
    if (!sqlite.prepare('PRAGMA table_info(Cuentas)').all().some((column) => column.name === 'nombre')) {
      sqlite.exec("ALTER TABLE Cuentas ADD COLUMN nombre TEXT NOT NULL DEFAULT ''");
      sqlite.exec("UPDATE Cuentas SET nombre = username WHERE nombre = ''");
    }
  },
  async transaction(callback) {
    if (!isPostgres) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(executor);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const tx = createExecutor(client);
      const result = await callback(tx);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Error al revertir la transacción PostgreSQL:', rollbackError);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  },
  async close() {
    if (isPostgres) await pool.end();
    else sqlite.close();
  },
  async health() {
    await db.get('SELECT 1');
  },
  isUniqueViolation(error) {
    return error.code === '23505' ||
      (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE constraint failed'));
  }
};

const dbReady = db.initialize();

module.exports = { db, dbReady, isPostgres };
