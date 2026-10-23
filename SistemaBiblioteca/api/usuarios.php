<?php
declare(strict_types=1);

/**
 * Tarea 1.3 — Controlador/API para insertar nuevos usuarios.
 *
 * POST /api/usuarios.php
 * Body JSON: { "nombre", "correo", "contrasena", "rol" }
 */

require_once __DIR__ . '/../app/bootstrap.php';

Response::cors(['POST', 'OPTIONS']);
Response::method(['POST']);

try {
    $data = Response::body();

    $nombre     = Validator::text($data, 'nombre', 3, 100);
    $correo     = Validator::email($data, 'correo');
    $contrasena = Validator::text($data, 'contrasena', 6, 72);
    $rol        = Validator::in(
        $data,
        'rol',
        ['administrador', 'bibliotecario', 'estudiante'],
        'estudiante'
    );

    $repo = new UsuarioRepository(Database::connection());

    if ($repo->findByEmail($correo) !== null) {
        Response::json(['error' => 'El correo ya está registrado.'], 409);
    }

    $usuario = $repo->create($nombre, $correo, $contrasena, $rol);

    Response::json([
        'success' => true,
        'message' => 'Usuario registrado correctamente.',
        'usuario' => $usuario,
    ], 201);
} catch (PDOException $e) {
    error_log('[api/usuarios] ' . $e->getMessage());

    if ($e->getCode() === '23000') {
        Response::json(['error' => 'El correo ya está registrado.'], 409);
    }

    Response::json(['error' => 'No se pudo registrar el usuario en la base de datos.'], 500);
} catch (Throwable $e) {
    error_log('[api/usuarios] ' . $e->getMessage());
    Response::json(['error' => 'Ocurrió un error interno al procesar la solicitud.'], 500);
}
