-- =====================================================================
-- Datos de ejemplo opcionales para probar el CRUD de libros.
-- Ejecutar después de database/schema.sql.
-- =====================================================================

USE biblioteca;

INSERT IGNORE INTO libros (codigo, titulo, autor, editorial, anio, ejemplares, disponibles)
VALUES
    ('LIB-001', 'Ingeniería de Software: Un Enfoque Práctico', 'Roger S. Pressman', 'McGraw-Hill', 2020, 3, 3),
    ('LIB-002', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', 2009, 2, 2),
    ('LIB-003', 'El Principito', 'Antoine de Saint-Exupéry', 'Salamandra', 2019, 5, 4);
