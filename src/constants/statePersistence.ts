// Duration in milliseconds that a detected state must persist before being confirmed
// Increased to 500ms to prevent state oscillation in dev mode due to ghost spinner lines
export const STATE_PERSISTENCE_DURATION_MS = 500;

// Check interval for state detection in milliseconds
export const STATE_CHECK_INTERVAL_MS = 100;
