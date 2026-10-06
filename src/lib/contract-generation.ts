/**
 * Deployment kill switch for drafting. Enabling it still requires a fresh,
 * authenticated worker for the explicitly selected provider and configuration.
 */
export const CONTRACT_GENERATION_PAUSED = process.env.GENERATION_ENABLED !== '1'

export const CONTRACT_GENERATION_PAUSED_MESSAGE =
  'AI drafting and refinement are paused. Existing documents and templates remain available.'
