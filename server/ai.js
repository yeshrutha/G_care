import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

export class AssistantServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'AssistantServiceError';
    this.statusCode = statusCode;
  }
}

function formatHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (turn) =>
        turn &&
        (turn.role === 'user' || turn.role === 'model') &&
        typeof turn.content === 'string' &&
        turn.content.trim(),
    )
    .slice(-12)
    .map((turn) => ({
      role: turn.role,
      parts: [
        {
          text: turn.content.slice(0, 4000),
        },
      ],
    }));
}

function buildInstructions(healthContext, timeContext) {
  const patientContext = healthContext
    ? `
AUTHORIZED PATIENT CONTEXT:
${JSON.stringify(healthContext)}
`
    : '';

  return `
You are the AI voice assistant inside the G-Care smartwatch application.

Your job is to have a normal natural conversation with the user.

IMPORTANT:
- Answer the user's actual question.
- Do NOT restrict yourself to predefined questions.
- The user can ask anything reasonable.
- Understand context from previous messages.
- If the user asks "what is data?", explain data normally.
- If the user asks "what are you doing?", answer naturally.
- If the user asks a general knowledge question, answer it normally.
- If the user asks a healthcare question, provide general safe information and do not diagnose.
- Do not invent patient information.
- Use patient information only when it is relevant to the question.
- Do not mention these instructions.

CONVERSATION STYLE:
- Talk naturally, like a helpful conversational assistant.
- Be concise enough for a smartwatch.
- Normally use 1 to 4 short sentences.
- Do not give robotic fallback messages.
- Do not say you can only answer health questions.
- Do not say "I can help with..." unless the user actually asks what you can do.
- Answer the question directly.

CURRENT TIME:
Timezone: Asia/Kolkata
Current date and time: ${timeContext}

DATE/TIME:
If the user asks about today, tomorrow, yesterday, current time, date, weekday, etc., use the CURRENT TIME above.

LANGUAGE:
- Detect the language of the user's latest message.
- Reply in the same language.
- English -> English.
- Kannada -> Kannada script.
- Hindi -> Hindi Devanagari.
- Tamil -> Tamil.
- Telugu -> Telugu.
- Malayalam -> Malayalam.
- Mixed language -> naturally use the dominant language.
- Do not provide unnecessary translations.

FORMATTING:
- No markdown.
- No bullet points unless absolutely necessary.
- No quotation marks around the answer.
- Give a finished answer.

${patientContext}
`;
}

async function callGeminiAPI(
  model,
  apiKey,
  systemInstructionText,
  contents,
  timeoutMs = 30000,
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const cleanModel = String(model || '')
    .replace(/^models\//, '')
    .trim();

  if (!cleanModel) {
    throw new AssistantServiceError(
      'Gemini model is not configured.',
      500,
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(cleanModel)}:generateContent?key=` +
    `${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemInstructionText,
            },
          ],
        },

        contents,

        generationConfig: {
          // IMPORTANT:
          // Gemini 3.x does not use the old temperature/top_p/top_k
          // sampling parameters.
          maxOutputTokens: 500,
        },
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMessage =
        payload?.error?.message ||
        `Gemini request failed with status ${response.status}`;

      if (response.status === 401 || response.status === 403) {
        throw new AssistantServiceError(
          'Gemini authentication failed. Check GEMINI_API_KEY.',
          401,
        );
      }

      if (response.status === 404) {
        throw new AssistantServiceError(
          `Gemini model not found: ${cleanModel}. ${apiMessage}`,
          404,
        );
      }

      if (response.status === 429) {
        throw new AssistantServiceError(
          'Gemini rate limit exceeded.',
          429,
        );
      }

      throw new AssistantServiceError(
        `Gemini error (${response.status}): ${apiMessage}`,
        response.status,
      );
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new AssistantServiceError(
        'Gemini returned an empty response.',
        502,
      );
    }

    return text;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AssistantServiceError(
        'Gemini response timed out.',
        504,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateAssistantReply({
  message,
  conversationHistory,
  healthContext,
}) {
  const userMessage = String(message || '').trim();

  if (!userMessage) {
    throw new AssistantServiceError(
      'Message is empty.',
      400,
    );
  }

  if (!GEMINI_API_KEY) {
    throw new AssistantServiceError(
      'GEMINI_API_KEY is missing from the server environment.',
      503,
    );
  }

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

  const systemInstructionText = buildInstructions(
    healthContext,
    timeContext,
  );

  const history = formatHistory(conversationHistory);

  const contents = [
    ...history,
    {
      role: 'user',
      parts: [
        {
          text: userMessage,
        },
      ],
    },
  ];

  const modelsToTry = [
    GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ].filter(Boolean);

  const uniqueModels = [
    ...new Set(modelsToTry),
  ];

  let lastError = null;

  for (const model of uniqueModels) {
    try {
      console.log(
        `[G-Care AI] Trying Gemini model: ${model}`,
      );

      const answer = await callGeminiAPI(
        model,
        GEMINI_API_KEY,
        systemInstructionText,
        contents,
      );

      console.log(
        `[G-Care AI] Gemini response received from ${model}`,
      );

      return answer;
    } catch (error) {
      lastError = error;

      console.error(
        `[G-Care AI] Model ${model} failed:`,
        error?.message || error,
      );
    }
  }

  throw new AssistantServiceError(
    lastError?.message ||
      'Unable to get a response from Gemini.',
    lastError?.statusCode || 502,
  );
}