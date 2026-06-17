// Pure business logic for Huddle.
//
// Environment-agnostic — no Supabase, no React, no platform APIs — so it
// can be exhaustively unit-tested. The run_picker Edge Function (Phase 7)
// imports the picker from here so the server owns the random outcome.

export * from './picker';
