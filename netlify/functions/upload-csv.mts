import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { parseCSV, buildColumnDefinitions } from './lib/csv-utils.mjs';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: { filename: string; content: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { filename, content, name } = body;
  if (!filename || !content) {
    return Response.json({ error: 'filename and content are required' }, { status: 400 });
  }

  let parsed: { headers: string[]; records: Record<string, string>[] };
  try {
    parsed = parseCSV(content);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }

  const { headers, records } = parsed;
  if (records.length === 0) {
    return Response.json({ error: 'CSV contains no data rows' }, { status: 422 });
  }

  const columnDefinitions = buildColumnDefinitions(headers, records);
  const datasetName = name || filename.replace(/\.csv$/i, '');

  const db = getDatabase();

  const [dataset] = await db.sql`
    INSERT INTO datasets (name, original_filename, row_count, column_definitions, status)
    VALUES (${datasetName}, ${filename}, ${records.length}, ${JSON.stringify(columnDefinitions)}::jsonb, 'ready')
    RETURNING *
  `;

  // Insert records in batches of 200
  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = db.sql.values(batch.map((r, j) => [dataset.id, i + j, JSON.stringify(r)]));
    await db.sql`
      INSERT INTO dataset_records (dataset_id, row_index, data)
      VALUES ${values}
    `;
  }

  return Response.json({
    id: dataset.id,
    name: dataset.name,
    rowCount: records.length,
    columns: columnDefinitions,
    createdAt: dataset.created_at,
  }, { status: 201 });
};

export const config: Config = {
  path: '/api/csv/upload',
  method: 'POST',
};
