// CSV parser — handles quoted fields, CRLF, and blank rows
export function parseCSV(text: string): { headers: string[]; records: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, j) => { record[h] = values[j] ?? ''; });
    records.push(record);
  }

  return { headers, records };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function round(v: number, dp = 4): number {
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

// Column type detection
export function detectColumnType(values: string[]): 'numeric' | 'categorical' | 'date' | 'text' | 'empty' {
  const nonEmpty = values.filter(v => v !== '' && v != null);
  if (nonEmpty.length === 0) return 'empty';

  const numericCount = nonEmpty.filter(v => !isNaN(parseFloat(v)) && isFinite(Number(v))).length;
  if (numericCount / nonEmpty.length >= 0.8) return 'numeric';

  const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/];
  const dateCount = nonEmpty.filter(v => datePatterns.some(p => p.test(v))).length;
  if (dateCount / nonEmpty.length >= 0.7) return 'date';

  const uniqueValues = new Set(nonEmpty).size;
  if (uniqueValues / nonEmpty.length < 0.5 && uniqueValues <= 30) return 'categorical';

  return 'text';
}

// Descriptive statistics for a numeric column
export function computeStats(values: string[]) {
  const nums = values.filter(v => !isNaN(parseFloat(v)) && isFinite(Number(v))).map(Number);
  if (nums.length === 0) return null;

  nums.sort((a, b) => a - b);
  const n = nums.length;
  const sum = nums.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const median = n % 2 === 0 ? (nums[n / 2 - 1] + nums[n / 2]) / 2 : nums[Math.floor(n / 2)];

  return {
    count: n,
    missing: values.length - n,
    min: round(nums[0]),
    max: round(nums[n - 1]),
    mean: round(mean),
    median: round(median),
    std: round(std),
    sum: round(sum),
    q1: round(nums[Math.floor(n * 0.25)]),
    q3: round(nums[Math.floor(n * 0.75)]),
  };
}

// Build column definition objects from parsed records
export function buildColumnDefinitions(headers: string[], records: Record<string, string>[]) {
  return headers.map(h => {
    const values = records.map(r => r[h] ?? '');
    const type = detectColumnType(values);
    const stats = type === 'numeric' ? computeStats(values) : null;
    const uniqueCount = new Set(values.filter(v => v !== '')).size;
    const missingCount = values.filter(v => v === '' || v == null).length;

    const categories: string[] = [];
    if (type === 'categorical') {
      const counts: Record<string, number> = {};
      values.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
      categories.push(...Object.keys(counts).slice(0, 50));
    }

    return { name: h, type, stats, uniqueCount, missingCount, categories };
  });
}

// Budget optimization — greedy by ROI
export interface OptimizeConfig {
  costColumn: string;
  returnColumn: string;
  labelColumn: string;
  totalBudget: number;
  minimumROI?: number;
}

interface OptimizeItem {
  index: number;
  label: string;
  cost: number;
  return: number;
  roi: number;
}

export function optimizeBudget(records: Record<string, string>[], config: OptimizeConfig) {
  const { costColumn, returnColumn, labelColumn, totalBudget, minimumROI = 0 } = config;

  const items: OptimizeItem[] = records
    .map((r, i) => {
      const cost = parseFloat(r[costColumn]);
      const ret = parseFloat(r[returnColumn]);
      const label = r[labelColumn] ?? `Row ${i + 1}`;
      const roi = cost > 0 && !isNaN(ret) ? ret / cost : 0;
      return { index: i, label, cost: isNaN(cost) ? 0 : cost, return: isNaN(ret) ? 0 : ret, roi };
    })
    .filter(item => item.cost > 0 && item.roi >= minimumROI);

  items.sort((a, b) => b.roi - a.roi);

  let remainingBudget = totalBudget;
  const allocated: OptimizeItem[] = [];
  const notAllocated: OptimizeItem[] = [];

  for (const item of items) {
    if (item.cost <= remainingBudget + 0.001) {
      allocated.push(item);
      remainingBudget -= item.cost;
    } else {
      notAllocated.push(item);
    }
  }

  const totalExpectedReturn = allocated.reduce((s, a) => s + a.return, 0);
  const totalAllocated = allocated.reduce((s, a) => s + a.cost, 0);

  const frontier = Array.from({ length: 10 }, (_, i) => {
    const pct = (i + 1) * 0.1;
    const cap = totalBudget * pct;
    let rem = cap;
    let ret = 0;
    for (const item of items) {
      if (item.cost <= rem) { ret += item.return; rem -= item.cost; }
    }
    return { budget: round(cap, 2), expectedReturn: round(ret, 2) };
  });

  return {
    allocated: allocated.map(a => ({ ...a, cost: round(a.cost, 2), return: round(a.return, 2), roi: round(a.roi, 4) })),
    notAllocated: notAllocated.map(a => ({ ...a, cost: round(a.cost, 2), return: round(a.return, 2), roi: round(a.roi, 4) })),
    summary: {
      totalBudget: round(totalBudget, 2),
      totalAllocated: round(totalAllocated, 2),
      remainingBudget: round(remainingBudget, 2),
      totalExpectedReturn: round(totalExpectedReturn, 2),
      overallROI: totalAllocated > 0 ? round(totalExpectedReturn / totalAllocated, 4) : 0,
      budgetUtilization: round((totalAllocated / totalBudget) * 100, 1),
      itemsAllocated: allocated.length,
      itemsSkipped: notAllocated.length,
    },
    frontier,
  };
}

// Normalize numeric values using min-max scaling
export function normalizeColumn(values: string[]): number[] {
  const nums = values.map(v => parseFloat(v));
  const valid = nums.filter(v => !isNaN(v));
  if (valid.length === 0) return nums.map(() => 0);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  return nums.map(v => isNaN(v) ? 0 : round((v - min) / range, 6));
}
