/**
 * Back-compat entrypoint. Prefer `node scripts/apply-sql.js …`.
 * Local Supabase Docker admin path is handled inside apply-sql.js.
 */
require('./apply-sql.js');
