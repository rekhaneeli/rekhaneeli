-- Dataset metadata table
CREATE TABLE datasets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_definitions JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CSV row data table
CREATE TABLE dataset_records (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Optimization results table
CREATE TABLE optimization_results (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dataset_records_dataset_id ON dataset_records(dataset_id);
CREATE INDEX idx_dataset_records_row_index ON dataset_records(dataset_id, row_index);
CREATE INDEX idx_optimization_results_dataset_id ON optimization_results(dataset_id);
