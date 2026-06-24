// Shared app-wide constants.

// The single site-owner account. Owner-only pages (Focus, Chess) and the
// demo-password gate check the signed-in user's email against this. Keep it
// here only, so a future change is one line and no gate is silently missed.
export const OWNER_EMAIL = 'rose.louis.mail@gmail.com';
