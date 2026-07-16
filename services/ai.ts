import { StorageService } from './storage';
import { auth } from './firebase';
import { AISuggestion, CommitmentCheckResult, LeadMeasureDefinition, CommitmentTemplate, CommitmentThemeReport } from '../types';
import { getTemplateCategoryLabel } from '../data/commitmentTemplates';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
] as const;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
let rateLimitCooldownUntil = 0;

function getCooldownRemainingMs(): number {
  return Math.max(0, rateLimitCooldownUntil - Date.now());
}

function isInRateLimitCooldown(): boolean {
  return getCooldownRemainingMs() > 0;
}

function startRateLimitCooldown(): void {
  rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

/**
 * Check if an error is a rate limit (429) error from the Gemini API.
 */
function isRateLimitError(e: any): boolean {
  const msg = String(e?.message || e?.error?.message || '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate') ||
    msg.includes('quota') ||
    e?.status === 429 ||
    e?.error?.code === 429
  );
}

/**
 * Retry wrapper with exponential backoff for Gemini API rate limits (429 errors).
 * Retries up to 3 times with increasing delays: 4s, 8s, 16s.
 * If all retries fail, tries falling back to the next available model.
 */
async function withRetryAndFallback<T>(
  fn: (model: string) => Promise<T>
): Promise<T> {
  if (isInRateLimitCooldown()) {
    const remaining = Math.ceil(getCooldownRemainingMs() / 1000);
    throw new Error(`AI rate limit cooldown active. Try again in ${remaining}s.`);
  }
  let lastError: any;

  for (const model of GEMINI_MODELS) {
    try {
      return await fn(model);
    } catch (e: any) {
      lastError = e;
      if (!isRateLimitError(e)) {
        throw e; // Non-rate-limit error, throw immediately
      }
    }
  }

  // All models exhausted — start cooldown to prevent hammering
  startRateLimitCooldown();
  throw lastError;
}

/**
 * Calls Gemini through the authenticated Cloud Run proxy. The API key lives
 * server-side only; the caller must be signed in.
 */
async function callGemini(model: string, prompt: string, jsonMode: boolean): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const base = import.meta.env.DEV ? '/api/whd-proxy' : StorageService.getProxyBaseUrl();
  const res = await fetch(`${base}/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ model, prompt, json: jsonMode })
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const err: any = new Error(`AI proxy error ${res.status}: ${bodyText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p?.text || '').join('');
}

function isAIAvailable(): boolean {
  return !!auth.currentUser;
}

export const AIService = {
  /**
   * Generates high-leverage 4DX commitments based on dynamic team context.
   */
  generateCommitmentSuggestions: async (
    tickets: any[],
    leadMeasures: LeadMeasureDefinition[],
    templates: CommitmentTemplate[]
  ): Promise<AISuggestion[]> => {
    try {
      const rawTickets = tickets || [];
      const insights = StorageService.getCategoryInsights();

      const counts: Record<string, number> = {};
      rawTickets.forEach(t => {
        counts[t.category] = (counts[t.category] || 0) + 1;
      });

      const topCategories = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label]) => {
          const insight = insights.find(i => i.category === label);
          return { label, summary: insight?.summary || "General technical recurring issues." };
        });

      const trendsDescription = topCategories.length > 0
        ? topCategories.map((c, i) => `${i + 1}. ${c.label}: ${c.summary}`).join('\n')
        : "No specific ticket trends available - focus purely on proactive 4DX maintenance.";

      const measuresDescription = (leadMeasures || []).length > 0
        ? leadMeasures.map((m, i) => `[Measure ${i + 1}]: ${m.name}\nDefinition: ${m.definition || 'No specific definition provided.'}`).join('\n\n')
        : "No specific lead measures defined yet.";

      const templatesDescription = (templates || []).length > 0
        ? templates.slice(0, 15).map((t, i) => `- [${t.title}]: ${t.description} (Category: ${getTemplateCategoryLabel(t.category)})`).join('\n')
        : "No strategy templates available.";

      const prompt = `
        You are the 4DX Strategic Execution Coach for an IT Support Team.
        
        GOAL: Map current ticket trends to our specific Lead Measures and Strategy Library.
        
        ---
        1. OUR DEFINED LEAD MEASURES (THE LEVERS):
        ${measuresDescription}

        ---
        2. OUR STRATEGY LIBRARY (EXISTING TEMPLATES):
        ${templatesDescription}

        ---
        3. REAL-WORLD TICKET TRENDS (Last 30 Days):
        ${trendsDescription}

        ---
        CORE INSTRUCTION - THE 50/50 BALANCE:
        Your suggestions must be balanced to ensure the team isn't just "fixing tickets."
        - 50% of suggestions should be "Detective Actions": Using ticket trends to find environmental/root causes (using provided Lead Measures).
        - 50% of suggestions should be "Pure Strategic Levers": High-leverage actions from the Strategy Library or Lead Measure definitions that aren't necessarily tied to a current ticket spike (e.g., proactive "Support Walks" to maintain visibility).

        MAP EVERY SUGGESTION:
        Every suggestion MUST be linked to one of the Lead Measures from Section 1.

        TASK:
        Generate 8-10 targeted commitment recommendations. 
        Use British English (e.g., "programme", "centre").
        
        Return ONLY a JSON Array of objects. No markdown.
        [
          {
            "commitment": "Actionable sentence (Prefer using [Template Name] if applicable)",
            "rationale": "Briefly: Why this specifically maps to a Lead Measure and addresses a trend.",
            "leadMeasureId": "The 'id' of the linked measure from Section 1",
            "leadMeasureName": "The 'name' of the linked measure from Section 1"
          }
        ]
      `;

      if (!isAIAvailable()) {
        return [];
      }

      const text = await withRetryAndFallback((model) => callGemini(model, prompt, true));
      if (!text) {
        return [];
      }

      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsed: any[] = JSON.parse(cleanText);
      return parsed.map((s, i) => ({
        id: `ai-sugg-${Date.now()}-${i}`,
        commitment: s.commitment,
        rationale: s.rationale,
        leadMeasureId: s.leadMeasureId,
        leadMeasureName: s.leadMeasureName
      }));
    } catch (e) {
      return [];
    }
  },

  /**
   * Validates if a user's commitment aligns with team Lead Measures.
   * Also checks for overlap with colleagues and redundancy with history.
   */
  checkCommitment: async (
    commitmentText: string,
    context: { colleagues: string[], history: string[] },
    leadMeasures: LeadMeasureDefinition[] = []
  ): Promise<CommitmentCheckResult | null> => {
    try {
      const measuresDescription = leadMeasures.length > 0
        ? leadMeasures.map((m, i) => `[${m.id}] "${m.name}": ${m.definition || 'No specific definition.'}`).join('\n')
        : "No lead measures defined.";

      const prompt = `
        You are a 4DX Coach enforcing strategic alignment for an IT Support Team.
        
        COMMITMENT TO ANALYZE: "${commitmentText}"

        TEAM'S CONFIGURED LEAD MEASURES:
        ${measuresDescription}

        CONTEXT:
        - Teammates' current commitments: ${JSON.stringify(context.colleagues)}
        - User's past commitments: ${JSON.stringify(context.history)}

        YOUR TASK:
        1. ALIGNMENT CHECK (CRITICAL): Does this commitment directly support ONE of the Lead Measures above?
           - If YES: Set isAligned: true and specify which measure.
           - If NO: Set isAligned: false. The commitment CANNOT be submitted without alignment.

        2. LEVERAGE CHECK: Is it proactive (high leverage) vs reactive (low leverage)?

        3. OVERLAP CHECK: Is a colleague already doing something very similar this week?

        4. REDUNDANCY CHECK: Has the user done this exact thing recently?

        5. REFRAME (ALWAYS REQUIRED): Write a suggestedAlternative that takes the user's original intent
           and reframes it as a specific, actionable commitment directly tied to one of the Lead Measures.
           - Preserve the core activity where possible (e.g. if they said "fix printers", reframe as a proactive
             protocol that addresses printer reliability as a lead measure lever).
           - The reframe must be concrete and measurable, not vague.
           - Even if the commitment IS aligned, still suggest a sharper version if possible.

        RULES:
        - A commitment MUST link to a Lead Measure to be valid.
        - suggestedAlternative is ALWAYS required — never return null or empty for this field.
        - Use British English (e.g., "programme", "centre").

        RETURN JSON ONLY:
        {
          "isEffective": boolean,
          "isAligned": boolean,
          "linkedLeadMeasureId": "The ID from the measures list, or null",
          "linkedLeadMeasureName": "The name from the measures list, or null",
          "score": number (0-10),
          "feedback": "Concise coaching advice explaining why this commitment is or isn't aligned, and what makes the suggested alternative stronger",
          "suggestedAlternative": "A reframed version of the user's commitment that IS aligned to a specific Lead Measure",
          "isRedundant": boolean,
          "isOverlapping": boolean,
          "overlapWarning": "Message if overlapping with teammate"
        }
      `;

      if (!isAIAvailable()) {
        return null;
      }
      const text = await withRetryAndFallback((model) => callGemini(model, prompt, true));

      const resultText = text.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
      return JSON.parse(resultText);
    } catch (e) {
      return null;
    }
  },

  /**
   * AI Strategy Architect: Generates permanent strategy templates based on team WIG settings.
   */
  generateTemplateDrafts: async (
    wigConfig: any,
    categories: string[]
  ): Promise<Omit<CommitmentTemplate, 'id'>[]> => {
    try {
      const measuresDescription = (wigConfig?.leadMeasures || []).map((m: any, i: number) =>
        `${i + 1}. ${m.name}: ${m.definition || 'General impact'}`
      ).join('\n') || "No lead measures defined.";

      const prompt = `
        You are the 4DX Strategic Architect. 
        Your task is to design a permanent "Playbook" of recurring commitment templates for an IT team.

        TEAM STRATEGY:
        WIG: ${wigConfig.title} - ${wigConfig.description}
        LEAD MEASURES (THE LEVERS):
        ${measuresDescription}

        VALID CATEGORIES:
        ${categories.join(', ')}

        INSTRUCTION:
        Generate 10 high-value recurring templates. 
        - These are not one-off tasks (like "Fix ticket #123").
        - These are recurring tactical protocols (e.g. "Weekly Lab sweep", "Department Walkthrough", "Infrastructure Audit").
        - Each must have a Title, a specific Description, an estimated duration, and a Potential Impact statement.
        - Strategic Alignment: Every template must directly contribute to one of the Lead Measures above.

        TASK:
        Return ONLY a JSON Array of objects. No markdown.
        [
          {
            "title": "Short, punchy title",
            "description": "Clear, actionable description of the recurring protocol.",
            "category": "One of the valid categories provided",
            "icon": "A single emoji representing the activity",
            "estimatedMinutes": number (15, 30, 45, or 60),
            "potentialImpact": "How this moves the needle on our Lead Measures",
            "suggestedFrequency": "weekly" | "biweekly" | "monthly"
          }
        ]
      `;

      if (!isAIAvailable()) {
        return [];
      }
      const text = await withRetryAndFallback((model) => callGemini(model, prompt, true));

      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText || '[]');
    } catch (e) {
      return [];
    }
  },

  /**
   * Generates a weekly summary of team achievements.
   */
  generateWeeklySummary: async (commitments: any[], weekId: string): Promise<string> => {
    try {
      if (!commitments || commitments.length === 0) return "No commitments completed this week yet. detailed summary unavailable.";

      const completed = commitments.filter(c => c.status === 'completed');
      if (completed.length === 0) return "No commitments completed this week yet. Let's get moving!";

      const prompt = `
        You are a team manager writing a brief weekly commitment review for an IT Support Team.
        
        WEEK ID: ${weekId}
        
        ALL COMMITMENTS SET THIS WEEK:
        ${commitments.map(c => `- ${c.description} (by ${c.userName || 'Team Member'}) [Status: ${c.status}]`).join('\n')}
        
        COMPLETED:
        ${completed.map(c => `- ${c.description} (by ${c.userName || 'Team Member'})`).join('\n')}
        
        STATS: ${completed.length} of ${commitments.length} commitments completed.

        TASK:
        Write a short, matter-of-fact summary (3-4 sentences) reviewing the team's commitments this week.
        - State what was committed to and what was delivered.
        - Note the completion rate (${completed.length}/${commitments.length}).
        - If some were missed or partial, note that plainly without judgement.
        - Do not be enthusiastic, motivational, or patronising. Do not use exclamation marks.
        - Be plain and direct, like a status report.
        - British English.
        - No markdown formatting, just plain text.
      `;

      if (!isAIAvailable()) {
        return "Unable to generate summary — you must be signed in.";
      }
      const text = await withRetryAndFallback((model) => callGemini(model, prompt, false));

      const finalSummary = text.trim() || "Great work team! (AI generation produced empty result)";
      return finalSummary;
    } catch (e: any) {
      const isRateLimit = e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit) {
        return "Unable to generate summary at this time. Rate limit reached — please try again in a few seconds.";
      }
      return "Unable to generate summary at this time.";
    }
  },

  /**
   * Classifies the kinds of work team members are committing to, so a manager can
   * see at a glance what categories of task each person is choosing. Returns a
   * structured object (overall narrative + per-member themes). Returns null when
   * the AI key is missing or generation fails so callers can hide the panel.
   */
  summarizeCommitmentThemes: async (
    byMember: { memberName: string; descriptions: string[] }[]
  ): Promise<CommitmentThemeReport | null> => {
    try {
      const populated = byMember.filter(m => m.descriptions.length > 0);
      if (populated.length === 0) return null;

      if (!isAIAvailable()) return null;

      const prompt = `
        You are analysing the weekly commitments an IT Support team has set, to help a
        manager understand the KINDS of work each person is choosing to focus on.

        For each team member, their commitment descriptions are listed below:
        ${populated.map(m => `\n### ${m.memberName}\n${m.descriptions.map(d => `- ${d}`).join('\n')}`).join('\n')}

        TASK — respond with ONLY a JSON object (no markdown, no code fences) of this exact shape:
        {
          "overall": "2-3 sentence plain summary of the kinds of work the team is committing to, and any categories that are over- or under-represented",
          "perMember": [
            { "memberName": "<name exactly as given>", "themes": ["3-5 short category labels, e.g. 'Documentation', 'Proactive maintenance', 'User training'"], "summary": "one plain sentence describing their focus" }
          ]
        }

        Rules:
        - British English. Plain, factual, non-judgemental. No exclamation marks.
        - Theme labels should be 1-3 words, Title Case.
        - Include every member listed above in perMember.
      `;

      const text = await withRetryAndFallback((model) => callGemini(model, prompt, true));

      // Strip any stray code fences before parsing.
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned) as CommitmentThemeReport;
      if (!parsed || !Array.isArray(parsed.perMember)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }
};
