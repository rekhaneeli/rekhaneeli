import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { optimizeBudget } from './lib/csv-utils.mjs';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: {
    datasetId: number;
    costColumn: string;
    returnColumn: string;
    labelColumn: string;
    totalBudget: number;
    minimumROI?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { datasetId, costColumn, returnColumn, labelColumn, totalBudget, minimumROI = 0 } = body;

  if (!datasetId || !costColumn || !returnColumn || !labelColumn || !totalBudget) {
    return Response.json(
      { error: 'datasetId, costColumn, returnColumn, labelColumn, and totalBudget are required' },
      { status: 400 }
    );
  }
  if (totalBudget <= 0) {
    return Response.json({ error: 'totalBudget must be a positive number' }, { status: 400 });
  }

  const db = getDatabase();

  const [dataset] = await db.sql`SELECT id, name FROM datasets WHERE id = ${datasetId}`;
  if (!dataset) return Response.json({ error: 'Dataset not found' }, { status: 404 });

  const rawRecords = await db.sql`
    SELECT data FROM dataset_records WHERE dataset_id = ${datasetId} ORDER BY row_index
  `;
  const records: Record<string, string>[] = rawRecords.map((r: { data: unknown }) => r.data as Record<string, string>);

  const result = optimizeBudget(records, { costColumn, returnColumn, labelColumn, totalBudget, minimumROI });

  const runConfig = { datasetId, costColumn, returnColumn, labelColumn, totalBudget, minimumROI };

  const [saved] = await db.sql`
    INSERT INTO optimization_results (dataset_id, config, results)
    VALUES (${datasetId}, ${JSON.stringify(runConfig)}::jsonb, ${JSON.stringify(result)}::jsonb)
    RETURNING id, created_at
  `;

  return Response.json({
    resultId: saved.id,
    datasetId,
    datasetName: dataset.name,
    config: runConfig,
    ...result,
  });
};

export const config: Config = {
  path: '/api/csv/optimize',
  method: 'POST',
};
