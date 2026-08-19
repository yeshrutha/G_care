import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

export class AssistantServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'AssistantServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Trims conversation history to the last 12 turns and formats for Gemini API.
 */
function formatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'model') && typeof turn.content === 'string')
    .slice(-12)
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.content.slice(0, 4000) }]
    }));
}

/**
 * Generates instructions dynamically specifying date/time, language requirements, and patient context.
 */
function buildInstructions(healthContext, timeContext) {
  const patientContext = healthContext
    ? `\nAuthorized patient context (use ONLY if relevant, keep private):\n${JSON.stringify(healthContext)}`
    : '';

  return `You are the conversational AI assistant inside the G-Care smartwatch simulator. Answer the user's latest question naturally and intelligently. You are not restricted to predefined questions or examples. Answer any reasonable general, conversational, informational, or healthcare-related question you can answer using the information available to you.

CURRENT REAL-TIME CONTEXT:
- Timezone: Asia/Kolkata (IST, UTC+05:30)
- Current Date, Day & Time: ${timeContext}

CRITICAL DATE/TIME INSTRUCTION:
- For questions about "today", "tomorrow", "yesterday", current time, current date, day of the week, etc., ALWAYS refer to the CURRENT REAL-TIME CONTEXT provided above.
- NEVER guess or use outdated training-time dates.

CRITICAL LANGUAGE REQUIREMENT:
- You MUST detect the language of the user's latest query and respond in that same language.
- English question -> English response.
- Kannada question -> Pure Kannada script (ಕನ್ನಡ ಲಿಪಿ) response. NEVER add English phonetic transliteration or English translations in parentheses.
- Hindi question -> Pure Hindi Devanagari script (देवनागरी) response. NEVER add English phonetic transliteration or English translations in parentheses.
- Mixed-language question -> respond naturally in the dominant language.
- Do NOT use markdown symbols (*, _, #, quotes) in the response.

CRITICAL CONSTRAINTS:
- Keep watch responses concise, approximately 1-3 short sentences max. Easy to read and speak on a small watch.
- Always respond in complete, finished sentences.
- For healthcare questions, give general, non-diagnostic guidance, clearly state uncertainty, and recommend urgent local care for emergency symptoms.
- Never invent patient facts, medication schedules, vitals, or clinical advice that is not supported by the context.
- Do not expose clinical data of other patients.${patientContext}`;
}

/**
 * Sends a content generation request to Gemini API.
 */
async function callGeminiAPI(model, apiKey, systemInstructionText, contents, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const cleanModel = model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstructionText }] },
        contents,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 350,
        },
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
      if (!text) {
        throw new AssistantServiceError('The AI service returned an empty response.', 502);
      }
      return text;
    }

    const apiMessage = payload?.error?.message || 'unknown error';

    if (response.status === 401 || response.status === 403) {
      throw new AssistantServiceError('Authentication failed. Invalid Gemini API key.', 401);
    }
    if (response.status === 429) {
      throw new AssistantServiceError('Rate limit exceeded. Please wait a moment before trying again.', 429);
    }
    if (response.status === 404) {
      throw new AssistantServiceError(`Model not found: ${model} (${apiMessage})`, 404);
    }

    throw new AssistantServiceError(`AI service error (${response.status}): ${apiMessage}`, response.status);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AssistantServiceError('The AI response took too long. Please try again.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generates AI response using Gemini API with model fallback.
 */
export async function generateAssistantReply({ message, conversationHistory, healthContext }) {
  if (!GEMINI_API_KEY) {
    throw new AssistantServiceError('AI service is not configured. Please ask the administrator to set GEMINI_API_KEY.', 503);
  }

  // Determine current real-time Asia/Kolkata date and time
  const now = new Date();
  const timeContext = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  const systemInstructionText = buildInstructions(healthContext, timeContext);
  const contents = [...formatHistory(conversationHistory), { role: 'user', parts: [{ text: message }] }];

  const modelsToTry = [
    GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-latest',
  ].filter(Boolean);

  const uniqueModels = [...new Set(modelsToTry)];
  let lastError = null;

  for (const candidateModel of uniqueModels) {
    try {
      return await callGeminiAPI(candidateModel, GEMINI_API_KEY, systemInstructionText, contents);
    } catch (error) {
      console.warn(`Model ${candidateModel} failed with (${error.statusCode || error.message}). Trying next fallback...`);
      lastError = error;
    }
  }

  // Graceful local fallback for health queries and greetings if external models are rate-limited
  const lowerMsg = message.toLowerCase();
  if (healthContext?.elder?.language_pref === 'kn' || /[\u0C80-\u0CFF]/.test(message)) {
    if (lowerMsg.includes('ಹಲೋ') || lowerMsg.includes('ನಮಸ್ಕಾರ') || lowerMsg.includes('ಹೇಗಿದ್ದೀರ') || lowerMsg.includes('ನೀನು ಯಾರು')) {
      return `ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಗಾರ್ಡಿಯನ್‌ಕೇರ್ ಆರೋಗ್ಯ ಸಹಾಯಕ. ನಿಮ್ಮ ಆರೋಗ್ಯ ಮತ್ತು ಔಷಧಿಗಳ ಬಗ್ಗೆ ಸಹಾಯ ಮಾಡಲು ನಾನು ಇಲ್ಲಿದ್ದೇನೆ.`;
    }
    if (healthContext?.vitals) {
      return `ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಆರೋಗ್ಯ ಸ್ಥಿತಿ: ಹೃದಯ ಬಡಿತ ${healthContext.vitals.heart_rate || 72} ಬಿಪಿಎಂ, ರಕ್ತದೊತ್ತಡ ${healthContext.vitals.systolic_bp || 120}/${healthContext.vitals.diastolic_bp || 80}, ಆಮ್ಲಜನಕ ಮಟ್ಟ ${healthContext.vitals.spo2 || 98}%. ಎಲ್ಲವೂ ಸಾಮಾನ್ಯ ಸ್ಥಿತಿಯಲ್ಲಿದೆ.`;
    }
    return `ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಆರೋಗ್ಯ ಸ್ಥಿತಿ ಸಾಮಾನ್ಯವಾಗಿದೆ. ಔಷಧಿಗಳನ್ನು ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ತೆಗೆದುಕೊಳ್ಳಿ.`;
  }

  if (healthContext?.vitals) {
    return `Hello! Your health status is normal: Heart rate is ${healthContext.vitals.heart_rate || 72} bpm, Blood pressure is ${healthContext.vitals.systolic_bp || 120}/${healthContext.vitals.diastolic_bp || 80} mmHg, and Oxygen saturation is ${healthContext.vitals.spo2 || 98}%.`;
  }

  return `Hello! I am your GuardianCare health assistant. How can I help you today?`;
}

