-- =====================================================================
-- Sistema de Biblioteca - ITCA FEPADE Santa Ana
-- Esquema genérico para el sprint 2.
--
-- Este archivo solo crea la estructura. Los datos de ejemplo están en
-- seed.sql. Si el sprint 2 cambia el diseño, basta con ajustar las
-- columnas y los repositorios de app/.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS biblioteca
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE biblioteca;

-- ---------------------------------------------------------------------
-- Tarea 1.3: usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre      VARCHAR(100) NOT NULL,
    correo      VARCHAR(150) NOT NULL,
    contrasena  VARCHAR(255) NOT NULL,
    rol         ENUM('administrador', 'bibliotecario', 'estudiante')
                NOT NULL DEFAULT 'estudiante',
    creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tarea 3.4: libros
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libros (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo       VARCHAR(30) NOT NULL,
    titulo       VARCHAR(200) NOT NULL,
    autor        VARCHAR(150) NOT NULL,
    editorial    VARCHAR(150) NULL,
    anio         SMALLINT UNSIGNED NULL,
    ejemplares   INT UNSIGNED NOT NULL DEFAULT 1,
    disponibles  INT UNSIGNED NOT NULL DEFAULT 1,
    creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_libros_codigo (codigo),
    CONSTRAINT chk_libros_disponibles CHECK (disponibles <= ejemplares)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
