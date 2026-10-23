<?php
declare(strict_types=1);

/**
 * Validaciones reutilizables para los datos que llegan por JSON.
 * Cuando una validación falla se responde 422 y se detiene la ejecución.
 */
final class Validator
{
    /**
     * Campo de texto obligatorio.
     */
    public static function text(array $data, string $key, int $min = 1, int $max = 255): string
    {
        $value = trim((string)($data[$key] ?? ''));

        if ($value === '') {
            self::fail("El campo «{$key}» es obligatorio.");
        }

        $length = mb_strlen($value);

        if ($length < $min || $length > $max) {
            self::fail("El campo «{$key}» debe tener entre $min y $max caracteres.");
        }

        return $value;
    }

    /**
     * Campo de texto opcional. Devuelve null si no viene o está vacío.
     */
    public static function optionalText(array $data, string $key, int $max = 255): ?string
    {
        if (!array_key_exists($key, $data) || $data[$key] === null) {
            return null;
        }

        $value = trim((string)$data[$key]);

        if ($value === '') {
            return null;
        }

        if (mb_strlen($value) > $max) {
            self::fail("El campo «{$key}» no puede superar los $max caracteres.");
        }

        return $value;
    }

    /**
     * Correo electrónico válido y normalizado a minúsculas.
     */
    public static function email(array $data, string $key = 'correo'): string
    {
        $value = strtolower(self::text($data, $key, 5, 150));

        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            self::fail('El correo electrónico no tiene un formato válido.');
        }

        return $value;
    }

    /**
     * Entero obligatorio dentro de un rango.
     */
    public static function int(array $data, string $key, int $min = 0, ?int $max = null): int
    {
        $value = filter_var($data[$key] ?? null, FILTER_VALIDATE_INT);

        if ($value === false) {
            self::fail("El campo «{$key}» debe ser un número entero.");
        }

        $value = (int)$value;

        if ($value < $min) {
            self::fail("El campo «{$key}» debe ser mayor o igual a $min.");
        }

        if ($max !== null && $value > $max) {
            self::fail("El campo «{$key}» debe ser menor o igual a $max.");
        }

        return $value;
    }

    /**
     * Entero opcional dentro de un rango. Devuelve null si no viene.
     */
    public static function optionalInt(array $data, string $key, int $min = 0, ?int $max = null): ?int
    {
        if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
            return null;
        }

        return self::int($data, $key, $min, $max);
    }

    /**
     * Valor restringido a una lista. Si no viene, usa el valor por defecto.
     *
     * @param list<string> $allowed
     */
    public static function in(array $data, string $key, array $allowed, ?string $default = null): string
    {
        $value = $data[$key] ?? $default;

        if ($value === null) {
            self::fail("El campo «{$key}» es obligatorio.");
        }

        $value = trim((string)$value);

        if (!in_array($value, $allowed, true)) {
            self::fail(
                "El campo «{$key}» debe ser uno de: " . implode(', ', $allowed) . '.'
            );
        }

        return $value;
    }

    /**
     * Detiene la petición con un error de validación.
     */
    private static function fail(string $message): never
    {
        Response::json(['error' => $message], 422);
    }
}
