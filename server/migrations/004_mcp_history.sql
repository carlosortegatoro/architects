ALTER TABLE diagrams ADD COLUMN revision integer NOT NULL DEFAULT 0;

CREATE TABLE diagram_mcp_history (
  diagram_id uuid PRIMARY KEY REFERENCES diagrams(id) ON DELETE CASCADE,
  past jsonb NOT NULL DEFAULT '[]'::jsonb,
  future jsonb NOT NULL DEFAULT '[]'::jsonb
);
