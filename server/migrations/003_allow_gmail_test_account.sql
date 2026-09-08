ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_check;

ALTER TABLE users
  ADD CONSTRAINT users_email_check CHECK (
    email ~* '^[^@\s]+@salesforce\.com$'
    OR lower(email) = 'carlosortegatoro@gmail.com'
  );
