import { GoogleGenAI } from "@google/genai";
import { StorageService } from './storage';
import { AISuggestion, CommitmentCheckResult, LeadMeasureDefinition, CommitmentTemplate } from '../types';
import { getTemplateCategoryLabel } from '../data/commitmentTemplates';

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

      // Always initialize with Vite environment variable
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
      if (!apiKey) {
        console.warn('AI: API key not configured.');
        return [];
      }
      const ai = new GoogleGenAI({ apiKey });

      const startTime = Date.now();
      const result = await ai.models.generateContent({
        model: 'models/gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      console.log(`🤖 AI: Model response received in ${Date.now() - startTime}ms`);

      // Robust text extraction
      let text = '';
      try {
        text = result.response?.text?.() || (result as any).text || '';
        if (!text && result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          text = result.response.candidates[0].content.parts[0].text;
        }
      } catch (e) {
        console.warn("AI: Standard text extraction failed, trying fallback...", e);
        text = (result as any).text || '';
      }

      if (!text) {
        console.error("AI: No text returned from model", result);
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
      console.error("AI Generation Error:", e);
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

        RULES:
        - A commitment MUST link to a Lead Measure to be valid.
        - If unaligned, provide a suggestedAlternative that IS aligned.
        - Use British English (e.g., "programme", "centre").
        
        RETURN JSON ONLY:
        {
          "isEffective": boolean,
          "isAligned": boolean,
          "linkedLeadMeasureId": "The ID from the measures list, or null",
          "linkedLeadMeasureName": "The name from the measures list, or null",
          "score": number (0-10),
          "feedback": "Concise coaching advice",
          "suggestedAlternative": "A version that IS aligned to a Lead Measure",
          "isRedundant": boolean,
          "isOverlapping": boolean,
          "overlapWarning": "Message if overlapping with teammate"
        }
      `;

      console.log("🤖 AI: Checking commitment for alignment/leverage/overlap...");
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
      if (!apiKey) {
        console.warn('Google AI API key not configured. Set VITE_GOOGLE_AI_API_KEY in .env file');
        return null;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'models/gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const resultText = response.text?.trim() || '{}';
      console.log("🤖 AI: Alignment check complete.");
      return JSON.parse(resultText);
    } catch (e) {
      console.error("AI Check failed", e);
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

      console.log("🤖 AI: Designing Strategy Playbook...");
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: 'models/gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      let text = '';
      try {
        text = result.response?.text?.() || (result as any).text || '';
        if (!text && result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          text = result.response.candidates[0].content.parts[0].text;
        }
      } catch (e) {
        text = (result as any).text || '';
      }

      console.log("🤖 AI: Playbook Drafted.");
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText || '[]');
    } catch (e) {
      console.error("AI Template Gen failed:", e);
      return [];
    }
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
        You are an enthusiastic Team Lead summarizing the week's achievements for an IT Support Team.
        
        WEEK ID: ${weekId}
        
        COMPLETED COMMITMENTS:
        ${completed.map(c => `- ${c.description} (by ${c.userName || 'Team Member'})`).join('\n')}

        TASK:
        Write a short, punchy, and motivational summary (max 3-4 sentences) of what the team accomplished this week.
        - Highlight specific wins (e.g. "We fixed the wifi", "We updated 5 guides").
        - Mention specific people if they did something notable, but keep it balanced.
        - Tone: Professional but high energy. "Did you know..." style is good.
        - British English.
        - No markdown formatting, just plain text.
      `;

      console.log("🤖 AI: Generating Weekly Summary...");
      const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: 'models/gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const text = result.response?.text?.() || "Great work team!";
      return text.trim();
    } catch (e) {
      console.error("AI Summary Gen failed:", e);
      return "Unable to generate summary at this time.";
    }
  }
};
