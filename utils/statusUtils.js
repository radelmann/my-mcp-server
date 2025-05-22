// Canonical status synonyms
const STATUS_SYNONYMS = {
  "open": ["reopen", "start over", "reset"],
  "in development": ["dev", "developing", "start dev", "kickoff", "start working", "begin work"],
  "code review": ["review", "send for review", "ready for review", "submit for review"],
  "in test": ["qa", "testing", "verify", "test it", "ready for qa"],
  "close": ["done", "complete", "finish", "resolved", "mark as done", "close it"],
};

function normalizeStatus(input) {
  const cleanInput = input.toLowerCase().trim();
  for (const [canonical, synonyms] of Object.entries(STATUS_SYNONYMS)) {
    if (
      canonical === cleanInput ||
      synonyms.some(s => s.toLowerCase() === cleanInput)
    ) {
      return canonical;
    }
  }

  console.warn(`Unknown status input received: "${input}"`);
  return input;
}

module.exports = {
  STATUS_SYNONYMS,
  normalizeStatus
};