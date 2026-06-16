import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';

export default async (req: Request, context: Context) => {
  const db = getDatabase();

  // GET /api/csv/datasets — list all datasets
  if (req.method === 'GET' && !context.params.id) {
    const datasets = await db.sql`
      SELECT id, name, original_filename, row_count, column_definitions, status, created_at
      FROM datasets
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return Response.json(datasets);
  }

  // GET /api/csv/datasets/:id — single dataset with records
  if (req.method === 'GET' && context.params.id) {
    const id = parseInt(context.params.id);
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 });

    const [dataset] = await db.sql`
      SELECT id, name, original_filename, row_count, column_definitions, status, created_at
      FROM datasets WHERE id = ${id}
    `;
    if (!dataset) return Response.json({ error: 'Dataset not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '100');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const records = await db.sql`
      SELECT row_index, data FROM dataset_records
      WHERE dataset_id = ${id}
      ORDER BY row_index
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({
      ...dataset,
      records: records.map((r: { data: unknown }) => r.data),
      pagination: { limit, offset, total: dataset.row_count },
    });
  }

  // DELETE /api/csv/datasets/:id
  if (req.method === 'DELETE' && context.params.id) {
    const id = parseInt(context.params.id);
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 });

    await db.sql`DELETE FROM datasets WHERE id = ${id}`;
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = {
  path: ['/api/csv/datasets', '/api/csv/datasets/:id'],
};
