<?php
declare(strict_types=1);

/**
 * Conexión PDO única (singleton).
 *
 * Soporta dos motores:
 *   - sqlite (por defecto): base de datos en un archivo local.
 *   - mysql: MariaDB/MySQL para el sprint 2.
 */
final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $config = require __DIR__ . '/../config/database.php';
        $driver = $config['driver'];

        try {
            self::$connection = match ($driver) {
                'sqlite' => self::connectSqlite($config['sqlite_path']),
                'mysql'  => self::connectMysql($config),
                default  => throw new RuntimeException(
                    "DB_DRIVER no soportado: $driver. Usa 'sqlite' o 'mysql'."
                ),
            };
        } catch (Throwable $e) {
            error_log('[database] ' . $e->getMessage());

            if (PHP_SAPI === 'cli') {
                throw $e;
            }

            Response::json([
                'error' => 'No se pudo conectar con la base de datos. Verifica la configuración.',
            ], 500);
        }

        return self::$connection;
    }

    private static function connectSqlite(string $path): PDO
    {
        $directory = dirname($path);

        if (
            !is_dir($directory)
            && !mkdir($directory, 0777, true)
            && !is_dir($directory)
        ) {
            throw new RuntimeException("No se pudo crear el directorio de la base SQLite: $directory");
        }

        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');

        self::ensureSqliteSchema($pdo);

        return $pdo;
    }

    /**
     * Crea las tablas la primera vez que se abre la base SQLite.
     */
    private static function ensureSqliteSchema(PDO $pdo): void
    {
        $exists = $pdo->query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'libros'"
        )->fetchColumn();

        if ($exists !== false) {
            return;
        }

        $schema = file_get_contents(__DIR__ . '/../database/schema.sqlite.sql');

        if ($schema === false) {
            throw new RuntimeException('No se encontró database/schema.sqlite.sql.');
        }

        $pdo->exec($schema);
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function connectMysql(array $config): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $config['host'],
            $config['port'],
            $config['name'],
            $config['charset']
        );

        return new PDO($dsn, $config['user'], $config['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
}
