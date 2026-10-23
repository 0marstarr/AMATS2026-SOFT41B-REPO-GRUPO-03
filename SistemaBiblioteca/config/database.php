<?php
declare(strict_types=1);

/**
 * Configuración de la conexión.
 *
 * Motor por defecto: SQLite (no requiere servidor ni contraseña).
 * Para usar MariaDB/MySQL: DB_DRIVER=mysql y completar DB_HOST, DB_PORT,
 * DB_NAME, DB_USER y DB_PASS.
 */

$sqlitePath = getenv('DB_SQLITE_PATH') ?: 'database/biblioteca.sqlite';

if (
    $sqlitePath !== ''
    && $sqlitePath[0] !== '/'
    && !preg_match('/^[A-Za-z]:[\\\\\\/]/', $sqlitePath)
) {
    $sqlitePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . $sqlitePath;
}

return [
    'driver'      => strtolower(getenv('DB_DRIVER') ?: 'sqlite'),
    'sqlite_path' => $sqlitePath,
    'host'        => getenv('DB_HOST') ?: '127.0.0.1',
    'port'        => getenv('DB_PORT') ?: '3307',
    'name'        => getenv('DB_NAME') ?: 'biblioteca',
    'user'        => getenv('DB_USER') ?: 'root',
    'pass'        => getenv('DB_PASS') !== false ? getenv('DB_PASS') : '',
    'charset'     => 'utf8mb4',
];
