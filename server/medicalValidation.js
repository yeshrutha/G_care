import zlib from 'node:zlib';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

// Medical indicator keywords (case-insensitive)
const MEDICAL_KEYWORDS = [
  // Clinical document types & sections
  'patient', 'specimen', 'physician', 'doctor', 'dr.', 'clinic', 'hospital',
  'laboratory', 'pathology', 'diagnostic', 'diagnosis', 'prescription', 'rx',
  'clinical', 'discharge summary', 'consultation', 'health checkup', 'medical report',
  'outpatient', 'inpatient', 'department of',

  // Common clinical tests & biomarkers
  'blood', 'hemoglobin', 'cbc', 'complete blood count', 'wbc', 'rbc', 'platelet',
  'leukocyte', 'neutrophil', 'lymphocyte', 'eosinophil', 'monocyte', 'basophil',
  'glucose', 'fasting blood sugar', 'postprandial', 'hba1c', 'glycated hemoglobin',
  'lipid profile', 'cholesterol', 'triglycerides', 'hdl', 'ldl', 'vldl',
  'creatinine', 'blood urea', 'bun', 'uric acid', 'kidney function', 'kft', 'rft',
  'liver function', 'lft', 'bilirubin', 'sgot', 'sgpt', 'ast', 'alt', 'alkaline phosphatase',
  'thyroid', 'tsh', 't3', 't4', 'urine analysis', 'serum', 'electrolytes', 'sodium', 'potassium',
  'calcium', 'vitamin d', 'vitamin b12', 'iron', 'ferritin', 'crp', 'esr',

  // Vitals & physiology
  'blood pressure', 'systolic', 'diastolic', 'mmhg', 'heart rate', 'bpm', 'pulse',
  'spo2', 'oxygen saturation', 'body temperature', 'respiratory rate',

  // Diagnostic imaging & cardiology
  'ecg', 'ekg', 'electrocardiogram', 'echocardiogram', 'echo', 'sinus rhythm',
  'x-ray', 'chest x-ray', 'radiology', 'ct scan', 'mri', 'ultrasound', 'sonography',
  'findings', 'impression', 'observations', 'reference range', 'normal range', 'biological reference'
];

// Explicit non-medical indicator keywords that indicate coursework, programming, business, or unrelated topics
const NON_MEDICAL_KEYWORDS = [
  'class notes', 'lecture notes', 'syllabus', 'curriculum', 'semester', 'course',
  'homework', 'assignment', 'question paper', 'exam schedule', 'textbook',
  'bachelor of engineering', 'computer science', 'information technology',
  'machine learning', 'artificial intelligence', 'big data', 'distributed systems',
  'software engineering', 'algorithm', 'data structure', 'python code', 'javascript code',
  'git commit', 'database management', 'sql query', 'programming language',
  'invoice', 'tax invoice', 'gstin', 'balance sheet', 'profit and loss',
  'financial statement', 'rental agreement', 'tenancy contract', 'resume', 'curriculum vitae'
];

/**
 * Extracts readable text streams from a PDF buffer.
 * Supports uncompressed text streams as well as FlateDecode (zlib-compressed) streams.
 * @param {Buffer} buffer 
 * @returns {string} Extracted text
 */
export function extractTextFromPdf(buffer) {
  try {
    const rawStr = buffer.toString('latin1');
    let decompressedStreams = '';

    // Match all PDF streams: stream ... endstream
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(rawStr)) !== null) {
      const streamBytes = Buffer.from(match[1], 'latin1');
      try {
        decompressedStreams += zlib.inflateSync(streamBytes).toString('latin1') + ' ';
      } catch {
        try {
          decompressedStreams += zlib.inflateRawSync(streamBytes).toString('latin1') + ' ';
        } catch {
          // Uncompressed text stream
          decompressedStreams += streamBytes.toString('latin1') + ' ';
        }
      }
    }

    // Extract text strings from BT ... ET (Begin Text ... End Text) blocks
    let extractedText = '';
    const btBlocks = decompressedStreams.match(/BT[\s\S]*?ET/g) || [];

    for (const block of btBlocks) {
      // PDF text strings are enclosed in parentheses: (Text) Tj or [(Text1) 20 (Text2)] TJ
      const stringMatches = [...block.matchAll(/\(([^)]*)\)/g)];
      for (const sm of stringMatches) {
        // Unescape standard PDF octal or escaped chars: \( \) \\
        const cleaned = sm[1]
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ');
        extractedText += cleaned;
      }
      extractedText += ' ';
    }

    // Also extract document info dictionary strings if present: /Title (...) /Subject (...)
    const metaMatches = [...rawStr.matchAll(/\/(?:Title|Subject|Keywords|Author)\s*\(([^)]*)\)/g)];
    for (const mm of metaMatches) {
      extractedText += ' ' + mm[1];
    }

    return extractedText.trim();
  } catch (err) {
    console.warn('PDF text extraction error:', err.message);
    return '';
  }
}

/**
 * Deterministic medical report content validation.
 * @param {string} text 
 * @param {string} fileName 
 * @returns {{ isMedical: boolean, score: number, nonMedicalScore: number, matchedMedical: string[], matchedNonMedical: string[] }}
 */
export function classifyMedicalDocument(text, fileName = '') {
  const normalizedText = (text + ' ' + fileName).toLowerCase();

  const matchedMedical = MEDICAL_KEYWORDS.filter((kw) => normalizedText.includes(kw));
  const matchedNonMedical = NON_MEDICAL_KEYWORDS.filter((kw) => normalizedText.includes(kw));

  const medicalScore = matchedMedical.length;
  const nonMedicalScore = matchedNonMedical.length;

  // If heavy non-medical markers exist (e.g., class notes, engineering syllabus, big data notes),
  // reject even if a minor word like "pulse" or "temperature" appears once.
  if (nonMedicalScore >= 2 && medicalScore < 5) {
    return {
      isMedical: false,
      score: medicalScore,
      nonMedicalScore,
      matchedMedical,
      matchedNonMedical,
    };
  }

  // To be recognized as a medical/clinical document:
  // Must match at least 2 distinct medical indicators
  const isMedical = medicalScore >= 2;

  return {
    isMedical,
    score: medicalScore,
    nonMedicalScore,
    matchedMedical,
    matchedNonMedical,
  };
}

/**
 * Optional Gemini classifier when text is sparse or borderline.
 * Runs on backend only - never exposes GEMINI_API_KEY.
 * @param {string} text 
 * @param {string} fileName 
 * @returns {Promise<boolean | null>} true if medical, false if not, null if unavailable
 */
async function classifyWithGemini(text, fileName) {
  if (!GEMINI_API_KEY) return null;

  try {
    const cleanModel = String(GEMINI_MODEL || 'gemini-2.5-flash').replace(/^models\//, '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const promptText = `
You are a medical document verification system.
Analyze the following document snippet and determine if it represents a valid clinical/medical report (such as a laboratory blood test, diagnostic scan, prescription, clinic consultation note, hospital discharge summary, or medical checkup report).

Filename: ${fileName}
Document Content:
${text.slice(0, 2000)}

Reply strictly in JSON format:
{
  "isMedical": true or false,
  "reason": "Brief explanation"
}
`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: { maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = await response.json();
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = replyText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return typeof parsed.isMedical === 'boolean' ? parsed.isMedical : null;
    }
    return null;
  } catch (err) {
    console.warn('Gemini document classification fallback failed:', err.message);
    return null;
  }
}

/**
 * Validates an uploaded medical report document.
 * @param {Buffer} buffer 
 * @param {string} fileName 
 * @param {string} mimeType 
 * @returns {Promise<{ isValid: boolean, error?: string, details?: any }>}
 */
export async function validateMedicalDocument(buffer, fileName, mimeType) {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: 'No file uploaded or file is empty.' };
  }

  // Maximum file size: 10 MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (buffer.length > MAX_FILE_SIZE) {
    return { isValid: false, error: 'File size exceeds maximum limit of 10 MB.' };
  }

  const cleanName = String(fileName || '').trim().toLowerCase();
  const isPdfExt = cleanName.endsWith('.pdf');
  const isPdfMime = mimeType === 'application/pdf' || mimeType === 'application/x-pdf';

  if (!isPdfExt && !isPdfMime) {
    return { isValid: false, error: 'Unsupported file format. Please upload a valid PDF clinical report.' };
  }

  // Validate PDF magic bytes: %PDF-
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF')) {
    return { isValid: false, error: 'The uploaded file is not a valid or readable PDF document.' };
  }

  // Extract text from the PDF
  const extractedText = extractTextFromPdf(buffer);

  // Classify document content deterministically
  const classification = classifyMedicalDocument(extractedText, fileName);

  // If clearly rejected by deterministic rules
  if (classification.nonMedicalScore >= 2 && classification.score < 4) {
    return {
      isValid: false,
      error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
      details: classification,
    };
  }

  if (classification.isMedical) {
    return { isValid: true, details: classification };
  }

  // If deterministic score is low (e.g. image-only PDF or sparse text),
  // attempt Gemini classification if available.
  if (extractedText.length > 50) {
    const geminiResult = await classifyWithGemini(extractedText, fileName);
    if (geminiResult === true) {
      return { isValid: true, details: { method: 'gemini' } };
    }
    if (geminiResult === false) {
      return {
        isValid: false,
        error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
      };
    }
  }

  // If text is present but contains no medical markers, reject
  if (extractedText.length > 100 && classification.score === 0) {
    return {
      isValid: false,
      error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
      details: classification,
    };
  }

  // If filename itself contains clear medical indicators (e.g. blood_test.pdf, cbc_report.pdf)
  // and PDF header is valid, accept with caution
  const filenameHasMedical = MEDICAL_KEYWORDS.some((kw) => cleanName.includes(kw));
  if (filenameHasMedical) {
    return { isValid: true, details: { method: 'filename_indicator' } };
  }

  return {
    isValid: false,
    error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
    details: classification,
  };
}
