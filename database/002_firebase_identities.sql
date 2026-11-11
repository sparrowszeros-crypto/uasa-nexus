-- Additional schema only. Existing accounts, roles, results and students are preserved.
CREATE TABLE IF NOT EXISTS account_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  provider text NOT NULL CHECK (provider = 'firebase'),
  project_id text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, project_id, subject),
  UNIQUE (account_id, provider, project_id)
);
