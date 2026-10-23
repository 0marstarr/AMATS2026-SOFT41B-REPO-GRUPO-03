<?php
declare(strict_types=1);

/**
 * Utilidades para construir respuestas JSON homogéneas.
 */
final class Response
{
    /**
     * Envía una respuesta JSON y termina la ejecución.
     */
    public static function json(array $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Configura CORS y responde los preflight OPTIONS.
     *
     * @param list<string> $methods
     */
    public static function cors(array $methods): void
    {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: ' . implode(', ', $methods));
        header('Access-Control-Allow-Headers: Content-Type, Accept');
        header('X-Content-Type-Options: nosniff');

        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /**
     * Valida el método HTTP y devuelve el método en mayúsculas.
     *
     * @param list<string> $allowed
     */
    public static function method(array $allowed): string
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        if (!in_array($method, $allowed, true)) {
            header('Allow: ' . implode(', ', $allowed));
            self::json([
                'error' => "El método $method no está permitido para este recurso.",
            ], 405);
        }

        return $method;
    }

    /**
     * Lee y decodifica el cuerpo JSON de la petición.
     *
     * @return array<string, mixed>
     */
    public static function body(): array
    {
        $raw = file_get_contents('php://input');

        if ($raw === false || trim($raw) === '') {
            self::json(['error' => 'El cuerpo de la petición está vacío.'], 400);
        }

        $data = json_decode($raw, true);

        if (!is_array($data)) {
            self::json(['error' => 'El cuerpo de la petición debe ser un JSON válido.'], 400);
        }

        return $data;
    }
}
