<?php
declare(strict_types=1);

/**
 * Punto de arranque común para los endpoints.
 * Carga la configuración, las clases y un .env opcional (sin Composer).
 */

$envPath = dirname(__DIR__) . '/.env';

if (is_readable($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        if ($key === '') {
            continue;
        }

        if (
            strlen($value) >= 2
            && (($value[0] === '"' && str_ends_with($value, '"'))
                || ($value[0] === "'" && str_ends_with($value, "'")))
        ) {
            $value = substr($value, 1, -1);
        }

        if (getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Validator.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/UsuarioRepository.php';
require_once __DIR__ . '/LibroRepository.php';
