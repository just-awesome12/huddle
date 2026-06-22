// =====================================================================
// @huddle/validation — Zod schemas shared between web and mobile
// =====================================================================
// All form-input shapes for the MVP. Schemas mirror the database
// CHECK constraints so client-side validation and database-level
// enforcement agree on what's valid.
//
// Schemas use `.trim()` and `.toLowerCase()` where appropriate so
// callers don't have to remember to normalise input.
// =====================================================================

export * from './username';
export * from './display-name';
export * from './auth';
export * from './profile';
export * from './groups';
export * from './invites';
export * from './ideas';
export * from './picker';
export * from './moderation';
export * from './comments';
export * from './posts';
export * from './candidate-sets';
