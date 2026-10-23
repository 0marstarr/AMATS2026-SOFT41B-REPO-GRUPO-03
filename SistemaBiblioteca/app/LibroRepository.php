<?php
declare(strict_types=1);

/**
 * Acceso a la tabla libros (CRUD completo).
 * Todas las consultas usan sentencias preparadas.
 */
final class LibroRepository
{
    private const COLUMNS = 'id, codigo, titulo, autor, editorial, anio, ejemplares, disponibles, creado_en';

    public function __construct(private PDO $pdo)
    {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function all(): array
    {
        $stmt = $this->pdo->query(
            'SELECT ' . self::COLUMNS . ' FROM libros ORDER BY titulo ASC'
        );

        return array_map([$this, 'map'], $stmt->fetchAll());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::COLUMNS . ' FROM libros WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);

        $row = $stmt->fetch();

        return $row === false ? null : $this->map($row);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByCode(string $codigo): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::COLUMNS . ' FROM libros WHERE codigo = ? LIMIT 1'
        );
        $stmt->execute([$codigo]);

        $row = $stmt->fetch();

        return $row === false ? null : $this->map($row);
    }

    /**
     * @param array{codigo:string,titulo:string,autor:string,editorial:?string,anio:?int,ejemplares:int,disponibles:int} $data
     * @return array<string, mixed>
     */
    public function create(array $data): array
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO libros (codigo, titulo, autor, editorial, anio, ejemplares, disponibles)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        $stmt->execute([
            $data['codigo'],
            $data['titulo'],
            $data['autor'],
            $data['editorial'],
            $data['anio'],
            $data['ejemplares'],
            $data['disponibles'],
        ]);

        return $this->find((int)$this->pdo->lastInsertId()) ?? [];
    }

    /**
     * @param array{codigo:string,titulo:string,autor:string,editorial:?string,anio:?int,ejemplares:int,disponibles:int} $data
     * @return array<string, mixed>|null
     */
    public function update(int $id, array $data): ?array
    {
        $stmt = $this->pdo->prepare(
            'UPDATE libros
             SET codigo = ?, titulo = ?, autor = ?, editorial = ?, anio = ?, ejemplares = ?, disponibles = ?
             WHERE id = ?'
        );

        $stmt->execute([
            $data['codigo'],
            $data['titulo'],
            $data['autor'],
            $data['editorial'],
            $data['anio'],
            $data['ejemplares'],
            $data['disponibles'],
            $id,
        ]);

        return $this->find($id);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM libros WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->rowCount() > 0;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function map(array $row): array
    {
        return [
            'id'          => (int)$row['id'],
            'codigo'      => $row['codigo'],
            'titulo'      => $row['titulo'],
            'autor'       => $row['autor'],
            'editorial'   => $row['editorial'],
            'anio'        => $row['anio'] !== null ? (int)$row['anio'] : null,
            'ejemplares'  => (int)$row['ejemplares'],
            'disponibles' => (int)$row['disponibles'],
            'creado_en'   => $row['creado_en'] ?? null,
        ];
    }
}
