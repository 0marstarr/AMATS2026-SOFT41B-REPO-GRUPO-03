-- =====================================================================
-- Sistema de Biblioteca - ITCA FEPADE Santa Ana
-- Esquema para SQLite (modo local por defecto).
--
-- Se ejecuta automáticamente la primera vez que se abre la base.
-- Para MariaDB/MySQL usar database/schema.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    correo      TEXT NOT NULL COLLATE NOCASE UNIQUE,
    contrasena  TEXT NOT NULL,
    rol         TEXT NOT NULL DEFAULT 'estudiante'
                CHECK (rol IN ('administrador', 'bibliotecario', 'estudiante')),
    creado_en   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS libros (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL COLLATE NOCASE UNIQUE,
    titulo       TEXT NOT NULL,
    autor        TEXT NOT NULL,
    editorial    TEXT,
    anio         INTEGER CHECK (anio IS NULL OR anio BETWEEN 1400 AND 2100),
    ejemplares   INTEGER NOT NULL DEFAULT 1 CHECK (ejemplares >= 1),
    disponibles  INTEGER NOT NULL DEFAULT 1
                 CHECK (disponibles >= 0 AND disponibles <= ejemplares),
    creado_en    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
