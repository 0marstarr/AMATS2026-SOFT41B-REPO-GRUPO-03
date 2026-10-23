<?php
declare(strict_types=1);

/**
 * Acceso a la tabla usuarios.
 * El esquema puede ajustarse en el sprint 2 sin tocar el controlador.
 */
final class UsuarioRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    /**
     * Busca un usuario por correo (sin exponer la contraseña).
     *
     * @return array<string, mixed>|null
     */
    public function findByEmail(string $correo): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, nombre, correo, rol, creado_en
             FROM usuarios
             WHERE correo = ?
             LIMIT 1'
        );
        $stmt->execute([$correo]);

        $row = $stmt->fetch();

        return $row === false ? null : $this->map($row);
    }

    /**
     * Inserta un usuario con la contraseña hasheada.
     *
     * @return array<string, mixed>
     */
    public function create(string $nombre, string $correo, string $contrasena, string $rol): array
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO usuarios (nombre, correo, contrasena, rol)
             VALUES (?, ?, ?, ?)'
        );

        $stmt->execute([
            $nombre,
            $correo,
            password_hash($contrasena, PASSWORD_DEFAULT),
            $rol,
        ]);

        $usuario = $this->findByEmail($correo);

        return $usuario ?? [
            'id'     => (int)$this->pdo->lastInsertId(),
            'nombre' => $nombre,
            'correo' => $correo,
            'rol'    => $rol,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function map(array $row): array
    {
        return [
            'id'        => (int)$row['id'],
            'nombre'    => $row['nombre'],
            'correo'    => $row['correo'],
            'rol'       => $row['rol'],
            'creado_en' => $row['creado_en'] ?? null,
        ];
    }
}
