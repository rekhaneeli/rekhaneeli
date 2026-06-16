import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { buildColumnDefinitions, normalizeColumn } from './lib/csv-utils.mjs';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { datasetId: number; options?: { normalize?: boolean; dropMissing?: boolean; encodeCategorical?: boolean } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { datasetId, options = {} } = body;
  if (!datasetId) return Response.json({ error: 'datasetId is required' }, { status: 400 });

  const db = getDatabase();

  const [dataset] = await db.sql`
    SELECT * FROM datasets WHERE id = ${datasetId}
  `;
  if (!dataset) return Response.json({ error: 'Dataset not found' }, { status: 404 });

  const rawRecords = await db.sql`
    SELECT data FROM dataset_records WHERE dataset_id = ${datasetId} ORDER BY row_index
  `;
  const records: Record<string, string>[] = rawRecords.map((r: { data: unknown }) => r.data as Record<string, string>);

  const columns: { name: string; type: string; stats: unknown; missingCount: number }[] =
    Array.isArray(dataset.column_definitions) ? dataset.column_definitions : JSON.parse(dataset.column_definitions as string);

  const headers = columns.map(c => c.name);

  // Drop rows with missing values in any column (optional)
  let workingRecords = records;
  if (options.dropMissing) {
    workingRecords = records.filter(r => headers.every(h => r[h] !== '' && r[h] != null));
  }

  // Build processed columns
  const processedColumns: Record<string, (string | number)[]> = {};
  const encodingMaps: Record<string, Record<string, number>> = {};

  for (const col of columns) {
    const vals = workingRecords.map(r => r[col.name] ?? '');

    if (col.type === 'numeric') {
      if (options.normalize) {
        processedColumns[col.name] = normalizeColumn(vals);
      } else {
        processedColumns[col.name] = vals.map(v => parseFloat(v) || 0);
      }
    } else if (col.type === 'categorical' && options.encodeCategorical) {
      const uniqueVals = [...new Set(vals.filter(v => v !== ''))];
      const encodingMap: Record<string, number> = {};
      uniqueVals.forEach((v, i) => { encodingMap[v] = i; });
      encodingMaps[col.name] = encodingMap;
      processedColumns[col.name] = vals.map(v => encodingMap[v] ?? -1);
    } else {
      processedColumns[col.name] = vals;
    }
  }

  // Build formatted row objects
  const formattedRecords = workingRecords.map((_, i) => {
    const row: Record<string, string | number> = {};
    Object.keys(processedColumns).forEach(col => { row[col] = processedColumns[col][i]; });
    return row;
  });

  // Data quality report
  const qualityReport = columns.map(col => {
    const totalRows = records.length;
    const missingCount = col.missingCount ?? 0;
    return {
      column: col.name,
      type: col.type,
      missingCount,
      missingPct: totalRows > 0 ? Math.round((missingCount / totalRows) * 1000) / 10 : 0,
      quality: missingCount === 0 ? 'good' : missingCount / totalRows < 0.1 ? 'fair' : 'poor',
    };
  });

  // Re-compute column definitions on processed data for summary
  const processedStr: Record<string, string>[] = formattedRecords.map(r => {
    const out: Record<string, string> = {};
    Object.entries(r).forEach(([k, v]) => { out[k] = String(v); });
    return out;
  });
  const updatedColumnDefs = buildColumnDefinitions(headers, processedStr);

  return Response.json({
    datasetId,
    originalRowCount: records.length,
    processedRowCount: workingRecords.length,
    droppedRows: records.length - workingRecords.length,
    options,
    qualityReport,
    columns: updatedColumnDefs,
    encodingMaps,
    sampleRecords: formattedRecords.slice(0, 20),
    modelingReadiness: {
      numericColumns: columns.filter(c => c.type === 'numeric').map(c => c.name),
      categoricalColumns: columns.filter(c => c.type === 'categorical').map(c => c.name),
      dateColumns: columns.filter(c => c.type === 'date').map(c => c.name),
      textColumns: columns.filter(c => c.type === 'text').map(c => c.name),
      overallMissingPct: Math.round(
        (columns.reduce((s, c) => s + (c.missingCount ?? 0), 0) / (records.length * columns.length || 1)) * 1000
      ) / 10,
    },
  });
};

export const config: Config = {
  path: '/api/csv/format',
  method: 'POST',
};
