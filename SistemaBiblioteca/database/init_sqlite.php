<?php
declare(strict_types=1);

/**
 * Inicializa la base SQLite local y carga los datos de ejemplo.
 *
 * Uso:
 *   php database/init_sqlite.php
 */

require_once __DIR__ . '/../app/bootstrap.php';

try {
    $pdo = Database::connection();

    $seed = file_get_contents(__DIR__ . '/seed.sqlite.sql');

    if ($seed === false) {
        throw new RuntimeException('No se encontró database/seed.sqlite.sql.');
    }

    $pdo->exec($seed);

    $total = (int)$pdo->query('SELECT COUNT(*) FROM libros')->fetchColumn();
    $config = require __DIR__ . '/../config/database.php';

    echo "Base SQLite lista.\n";
    echo 'Archivo: ' . $config['sqlite_path'] . "\n";
    echo "Libros de ejemplo: $total\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
    exit(1);
}
