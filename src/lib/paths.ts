// Root directory for all local databases (app.db, users/<id>.db, .session-secret).
// Override with KATK_DATA_DIR to relocate or isolate (e.g. for tests).
export const DATA_DIR = process.env.KATK_DATA_DIR ?? "data";
