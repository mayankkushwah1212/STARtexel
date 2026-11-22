-- Create application database role if it does not already exist (without hardcoded password)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'startexel_app') THEN
    CREATE ROLE startexel_app WITH LOGIN;
  END IF;
END
$$;

-- Grant usage on database and schema
GRANT CONNECT ON DATABASE startexel TO startexel_app;
GRANT USAGE ON SCHEMA public TO startexel_app;

-- Grant standard DML on tables to startexel_app
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO startexel_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO startexel_app;

-- Ensure future tables grant standard access
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO startexel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO startexel_app;

-- Explicitly revoke UPDATE and DELETE privileges on audit_logs from app user and PUBLIC
REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM startexel_app;
REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM PUBLIC;
