<?php
declare(strict_types=1);

/**
 * Tarea 3.4 — Endpoints CRUD para la tabla libros.
 *
 * GET    /api/libros.php          → listar todos
 * GET    /api/libros.php?id=1     → consultar uno
 * POST   /api/libros.php          → crear
 * PUT    /api/libros.php?id=1     → actualizar
 * DELETE /api/libros.php?id=1     → eliminar
 */

require_once __DIR__ . '/../app/bootstrap.php';

Response::cors(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
$method = Response::method(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * Lee y valida el id recibido por query string.
 */
function libroId(): int
{
    $raw = $_GET['id'] ?? null;

    if ($raw === null || $raw === '') {
        Response::json(['error' => 'El parámetro «id» es obligatorio.'], 422);
    }

    $id = filter_var($raw, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1],
    ]);

    if ($id === false) {
        Response::json(['error' => 'El parámetro «id» no es un identificador válido.'], 422);
    }

    return (int)$id;
}

/**
 * Valida y normaliza los campos de un libro.
 *
 * @param array<string, mixed> $data
 * @param int|null $disponiblesActuales Valor a conservar si no se envía "disponibles".
 * @return array{codigo:string,titulo:string,autor:string,editorial:?string,anio:?int,ejemplares:int,disponibles:int}
 */
function libroData(array $data, ?int $disponiblesActuales = null): array
{
    $ejemplares = Validator::int($data, 'ejemplares', 1, 100000);

    if (array_key_exists('disponibles', $data)) {
        $disponibles = Validator::int($data, 'disponibles', 0, $ejemplares);
    } elseif ($disponiblesActuales !== null) {
        $disponibles = min($disponiblesActuales, $ejemplares);
    } else {
        $disponibles = $ejemplares;
    }

    return [
        'codigo'      => Validator::text($data, 'codigo', 2, 30),
        'titulo'      => Validator::text($data, 'titulo', 2, 200),
        'autor'       => Validator::text($data, 'autor', 2, 150),
        'editorial'   => Validator::optionalText($data, 'editorial', 150),
        'anio'        => Validator::optionalInt($data, 'anio', 1400, (int)date('Y') + 1),
        'ejemplares'  => $ejemplares,
        'disponibles' => $disponibles,
    ];
}

try {
    $repo = new LibroRepository(Database::connection());

    switch ($method) {
        case 'GET':
            if (array_key_exists('id', $_GET)) {
                $libro = $repo->find(libroId());

                if ($libro === null) {
                    Response::json(['error' => 'Libro no encontrado.'], 404);
                }

                Response::json(['libro' => $libro]);
            }

            $libros = $repo->all();
            Response::json([
                'libros' => $libros,
                'total'  => count($libros),
            ]);

        case 'POST':
            $data = libroData(Response::body());

            if ($repo->findByCode($data['codigo']) !== null) {
                Response::json(['error' => 'Ya existe un libro con ese código.'], 409);
            }

            $libro = $repo->create($data);

            Response::json([
                'success' => true,
                'message' => 'Libro creado correctamente.',
                'libro'   => $libro,
            ], 201);

        case 'PUT':
            $id = libroId();
            $actual = $repo->find($id);

            if ($actual === null) {
                Response::json(['error' => 'Libro no encontrado.'], 404);
            }

            $data = libroData(Response::body(), (int)$actual['disponibles']);
            $existente = $repo->findByCode($data['codigo']);

            if ($existente !== null && (int)$existente['id'] !== $id) {
                Response::json(['error' => 'Ya existe otro libro con ese código.'], 409);
            }

            $libro = $repo->update($id, $data);

            Response::json([
                'success' => true,
                'message' => 'Libro actualizado correctamente.',
                'libro'   => $libro,
            ]);

        case 'DELETE':
            $id = libroId();

            if (!$repo->delete($id)) {
                Response::json(['error' => 'Libro no encontrado.'], 404);
            }

            Response::json([
                'success' => true,
                'message' => 'Libro eliminado correctamente.',
            ]);
    }
} catch (PDOException $e) {
    error_log('[api/libros] ' . $e->getMessage());

    if ($e->getCode() === '23000') {
        Response::json(['error' => 'El código del libro ya está registrado.'], 409);
    }

    Response::json(['error' => 'No se pudo completar la operación en la base de datos.'], 500);
} catch (Throwable $e) {
    error_log('[api/libros] ' . $e->getMessage());
    Response::json(['error' => 'Ocurrió un error interno al procesar la solicitud.'], 500);
}
