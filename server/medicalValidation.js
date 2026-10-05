import zlib from 'node:zlib';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

// Explicit non-medical indicator keywords that indicate coursework, university assignments, programming, or unrelated topics
export const NON_MEDICAL_KEYWORDS = [
  // Academic & Coursework
  'assignment', 'homework', 'coursework', 'bda', 'big data', 'class notes', 'lecture notes',
  'syllabus', 'curriculum', 'semester', 'course code', 'subject code', 'question paper',
  'exam schedule', 'midterm', 'final exam', 'quiz', 'textbook', 'lab manual', 'study material',
  'bachelor of engineering', 'computer science', 'information technology', 'b.tech', 'm.tech', 'bca', 'mca',
  'b.e.', 'm.e.', 'vtu', 'visvesvaraya', 'university', 'college of engineering', 'institute of technology',
  'polytechnic', 'student', 'roll no', 'roll number', 'reg no', 'register number', 'usn',
  'submitted by', 'submitted to', 'guided by', 'department of cse', 'department of ise',
  'department of ece', 'department of me', 'department of civil', 'computer science and engineering',
  'project report', 'mini project', 'major project', 'term paper', 'dissertation', 'thesis',
  'problem statement', 'exercise', 'practicals',

  // Tech, Programming, Machine Learning, Data Science
  'big data analytics', 'machine learning', 'artificial intelligence', 'distributed systems', 'deep learning',
  'software engineering', 'algorithm', 'algorithms', 'data structure', 'data structures',
  'python code', 'javascript code', 'git commit', 'database management', 'dbms',
  'sql query', 'programming language', 'hadoop', 'spark', 'mapreduce', 'hdfs', 'hive', 'pig',
  'jupyter', 'kaggle', 'dataset', 'neural network', 'linear regression', 'random forest',
  'source code', 'github', 'repository', 'train test split', 'scikit-learn', 'pandas', 'numpy',
  'matplotlib', 'tensorflow', 'pytorch', 'confusion matrix', 'hyperparameter', 'epoch',

  // Business, Invoicing, Legal, Resumes
  'invoice', 'tax invoice', 'gstin', 'balance sheet', 'profit and loss',
  'financial statement', 'rental agreement', 'tenancy contract', 'lease agreement',
  'resume', 'curriculum vitae'
];

// Primary Clinical Indicators - Specific to clinical laboratory tests, pathology, cardiology, vitals, prescriptions
export const PRIMARY_CLINICAL_INDICATORS = [
  'complete blood count', 'cbc', 'hemoglobin', 'lipid profile', 'cholesterol',
  'triglycerides', 'blood glucose', 'fasting blood sugar', 'postprandial', 'hba1c',
  'creatinine', 'blood urea', 'uric acid', 'liver function', 'lft', 'kft', 'rft',
  'bilirubin', 'sgot', 'sgpt', 'thyroid profile', 'tsh', 't3', 't4', 'urine routine',
  'urine analysis', 'pathology report', 'diagnostic report', 'biochemistry',
  'wbc count', 'rbc count', 'platelet count', 'leukocyte', 'neutrophil',
  'lymphocyte', 'eosinophil', 'monocyte', 'erythrocyte', 'hematocrit',
  'serum electrolytes', 'sodium', 'potassium', 'vitamin d', 'vitamin b12',
  'electrocardiogram', 'ecg', 'ekg', 'chest x-ray', 'x-ray', 'radiology report',
  'ct scan', 'mri scan', 'ultrasound', 'sonography', '2d echo', 'echocardiogram',
  'blood pressure', 'systolic', 'diastolic', 'spo2', 'oxygen saturation',
  'heart rate bpm', 'pulse rate', 'respiratory rate',
  'reference range', 'reference interval', 'biological reference', 'normal range',
  'specimen', 'sample collected', 'sample reported', 'lab no', 'uhid',
  'prescribed by', 'prescription', 'clinical diagnosis', 'discharge summary'
];

// General medical keywords
export const GENERAL_MEDICAL_KEYWORDS = [
  'patient', 'doctor', 'dr.', 'physician', 'hospital', 'clinic',
  'laboratory', 'pathology', 'diagnostic', 'diagnosis', 'prescription',
  'consultation', 'health checkup', 'medical report', 'outpatient', 'inpatient',
  'blood', 'serum', 'urine', 'findings', 'impression', 'rx', 'vital signs'
];

/**
 * Helper to match keyword terms accurately against text.
 * Short terms (<= 4 chars like 'bda', 'vtu', 'usn', 'cbc', 'ecg') require word boundaries.
 */
export function findMatches(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.filter((kw) => {
    if (kw.length <= 4) {
      const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i');
      return regex.test(lower);
    }
    return lower.includes(kw);
  });
}

/**
 * Extracts readable text and metadata strings from a PDF buffer.
 * Supports uncompressed text, FlateDecode streams, hex strings, and PDF metadata dictionaries.
 * @param {Buffer} buffer 
 * @returns {string} Extracted text
 */
export function extractTextFromPdf(buffer) {
  try {
    const rawStr = buffer.toString('latin1');
    let decompressedStreams = '';

    // 1. Extract streams (compressed and uncompressed)
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
          decompressedStreams += streamBytes.toString('latin1') + ' ';
        }
      }
    }

    const combinedPool = decompressedStreams + ' ' + rawStr;
    let extractedText = '';

    // 2. Extract parenthesized text: (text) Tj or [(text1) 20 (text2)] TJ
    const stringMatches = combinedPool.matchAll(/\(([^)]{2,})\)/g);
    for (const sm of stringMatches) {
      const cleaned = sm[1]
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\[nrtbf]/g, ' ')
        .trim();
      if (cleaned.length > 1 && !cleaned.startsWith('/')) {
        extractedText += cleaned + ' ';
      }
    }

    // 3. Extract hexadecimal encoded strings: <424441...> Tj
    const hexMatches = combinedPool.matchAll(/<([0-9a-fA-F]{4,})>/g);
    for (const hm of hexMatches) {
      try {
        let hex = hm[1];
        if (hex.length % 2 !== 0) hex += '0';
        const decoded = Buffer.from(hex, 'hex').toString('latin1');
        if (/^[\x20-\x7E\s]+$/.test(decoded)) {
          extractedText += decoded + ' ';
        }
      } catch {}
    }

    // 4. Extract PDF metadata dictionaries: /Title (...) /Subject (...) /Keywords (...)
    const metaMatches = rawStr.matchAll(/\/(?:Title|Subject|Keywords|Author|Creator)\s*\(([^)]*)\)/g);
    for (const mm of metaMatches) {
      extractedText += mm[1] + ' ';
    }

    // 5. Extract XMP metadata if embedded
    const xmpMatches = rawStr.matchAll(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/gi);
    for (const xm of xmpMatches) {
      extractedText += xm[1] + ' ';
    }

    return extractedText.trim();
  } catch (err) {
    console.warn('PDF text extraction error:', err.message);
    return '';
  }
}

/**
 * Deterministic medical report content validation.
 * @param {string} text Extracted document text
 * @param {string} fileName Uploaded document filename
 * @param {{ title?: string, description?: string, category?: string }} metadata Upload form metadata
 * @returns {{ isMedical: boolean, score: number, nonMedicalScore: number, matchedMedical: string[], matchedNonMedical: string[], reason?: string }}
 */
export function classifyMedicalDocument(text, fileName = '', metadata = {}) {
  const combinedText = [
    metadata.title || '',
    metadata.description || '',
    metadata.category || '',
    fileName || '',
    text || '',
  ].join(' ');

  const matchedNonMedical = findMatches(combinedText, NON_MEDICAL_KEYWORDS);
  const matchedPrimary = findMatches(combinedText, PRIMARY_CLINICAL_INDICATORS);
  const matchedGeneral = findMatches(combinedText, GENERAL_MEDICAL_KEYWORDS);

  const matchedMedical = [...new Set([...matchedPrimary, ...matchedGeneral])];
  const medicalScore = matchedMedical.length;
  const nonMedicalScore = matchedNonMedical.length;

  // STRICT RULE: If ANY non-medical / coursework / academic marker is detected,
  // REJECT IMMEDIATELY. Even if the assignment references patient/healthcare dataset data.
  if (nonMedicalScore > 0) {
    return {
      isMedical: false,
      score: medicalScore,
      nonMedicalScore,
      matchedMedical,
      matchedNonMedical,
      reason: `Detected academic or non-clinical document indicator(s): ${matchedNonMedical.slice(0, 4).join(', ')}`,
    };
  }

  // To be recognized as a valid medical/clinical document:
  // Must have at least 1 primary clinical indicator (e.g. CBC, ECG, blood pressure, etc.)
  // OR at least 3 general medical keywords.
  const isMedical = matchedPrimary.length >= 1 || matchedGeneral.length >= 3;

  return {
    isMedical,
    score: medicalScore,
    nonMedicalScore: 0,
    matchedMedical,
    matchedNonMedical: [],
    reason: isMedical ? 'Matched clinical report indicators.' : 'Insufficient clinical markers found in document.',
  };
}

/**
 * Optional Gemini classifier when text is sparse or borderline.
 * Runs on backend only - never exposes GEMINI_API_KEY.
 * @param {string} text 
 * @param {string} fileName 
 * @param {{ title?: string, description?: string, category?: string }} metadata
 * @returns {Promise<boolean | null>} true if medical, false if not, null if unavailable
 */
async function classifyWithGemini(text, fileName, metadata = {}) {
  if (!GEMINI_API_KEY) return null;

  try {
    const cleanModel = String(GEMINI_MODEL || 'gemini-2.5-flash').replace(/^models\//, '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const promptText = `
You are a medical clinical document verification validator.
Carefully evaluate whether this document represents a genuine CLINICAL MEDICAL REPORT (such as a laboratory blood test, complete blood count, pathology report, diagnostic scan, ECG, prescription, or hospital checkup summary).

CRITICAL RULE:
If this document is an academic assignment, student homework, coursework, project report, engineering syllabus, lecture notes, textbook excerpt, programming or big data task (even if it uses a healthcare/medical dataset such as predicting diabetes or heart disease) — it is NOT a clinical medical report and you MUST return "isMedical": false.

Document metadata:
Title: ${metadata.title || 'N/A'}
Filename: ${fileName}
Category: ${metadata.category || 'N/A'}

Document text snippet:
${text.slice(0, 3000)}

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
 * @param {{ title?: string, description?: string, category?: string }} metadata
 * @returns {Promise<{ isValid: boolean, error?: string, details?: any }>}
 */
export async function validateMedicalDocument(buffer, fileName, mimeType, metadata = {}) {
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
  const classification = classifyMedicalDocument(extractedText, fileName, metadata);

  // If rejected by non-medical markers
  if (classification.nonMedicalScore > 0) {
    return {
      isValid: false,
      error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
      details: classification,
    };
  }

  if (classification.isMedical) {
    return { isValid: true, details: classification };
  }

  // If deterministic score is low (e.g. scanned image PDF or sparse text),
  // attempt Gemini classification if available.
  if (extractedText.length > 30) {
    const geminiResult = await classifyWithGemini(extractedText, fileName, metadata);
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

  // If filename itself contains clear medical indicators (e.g. blood_test.pdf, cbc_report.pdf)
  // and NO non-medical keywords were found, accept with caution
  const filenameHasPrimary = PRIMARY_CLINICAL_INDICATORS.some((kw) => cleanName.includes(kw));
  if (filenameHasPrimary) {
    return { isValid: true, details: { method: 'filename_indicator' } };
  }

  return {
    isValid: false,
    error: 'Invalid medical report. Please upload a valid clinical/checkup report.',
    details: classification,
  };
}
