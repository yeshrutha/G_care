import { describe, it, expect } from 'vitest';
import {
  extractTextFromPdf,
  classifyMedicalDocument,
  validateMedicalDocument,
} from '../../server/medicalValidation.js';
import { dbService, createSeedDb } from '../../server/db.js';

// Helper to create a minimal valid PDF buffer containing arbitrary text
function createMinimalPdf(textContent: string): Buffer {
  const streamContent = `BT /F1 12 Tf 72 712 Td (${textContent.replace(/[()]/g, '')}) Tj ET`;
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${streamContent.length} >>
stream
${streamContent}
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
310
%%EOF`;

  return Buffer.from(pdfString, 'utf-8');
}

describe('Medical Report Document Validation', () => {
  it('extracts text accurately from PDF stream objects', () => {
    const samplePdf = createMinimalPdf('Patient Usha - Complete Blood Count CBC Hemoglobin 12.5 g/dl');
    const extracted = extractTextFromPdf(samplePdf);
    expect(extracted).toContain('Patient Usha');
    expect(extracted).toContain('Complete Blood Count');
  });

  it('accepts a valid clinical lab / blood test report', async () => {
    const medicalPdf = createMinimalPdf(
      'Apollo Hospital Diagnostic Laboratory. Patient Name: Usha. Age: 77. Dr. Ramesh Kumar. Complete Blood Count CBC. Hemoglobin: 12.8 g/dL. Platelets: 240,000. Glucose Fasting: 110 mg/dL. Reference Range normal.'
    );

    const result = await validateMedicalDocument(medicalPdf, 'Blood_Test_Report.pdf', 'application/pdf');
    expect(result.isValid).toBe(true);
  });

  it('rejects an academic or coursework document (e.g. Class Notes - Big Data.pdf)', async () => {
    const nonMedicalPdf = createMinimalPdf(
      'Computer Science Department. Semester 6 Syllabus. Class Notes - Big Data and Machine Learning. Homework assignment on distributed algorithms and python programming.'
    );

    const result = await validateMedicalDocument(nonMedicalPdf, 'Class Notes - Big Data.pdf', 'application/pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid medical report. Please upload a valid clinical/checkup report.');
  });

  it('rejects non-PDF and corrupted files', async () => {
    const textBuffer = Buffer.from('This is a plain text file pretending to be a medical report.', 'utf-8');
    const result = await validateMedicalDocument(textBuffer, 'notes.txt', 'text/plain');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unsupported file format');

    const fakePdf = Buffer.from('NOT_A_PDF_HEADER_SOME_GARBAGE_BYTES', 'utf-8');
    const corruptResult = await validateMedicalDocument(fakePdf, 'fake.pdf', 'application/pdf');
    expect(corruptResult.isValid).toBe(false);
    expect(corruptResult.error).toContain('not a valid or readable PDF');
  });

  it('rejects files exceeding 10 MB limit', async () => {
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
    const result = await validateMedicalDocument(oversizedBuffer, 'huge.pdf', 'application/pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds maximum limit of 10 MB');
  });

  it('correctly classifies medical keywords versus non-medical coursework keywords', () => {
    const medResult = classifyMedicalDocument('blood pressure systolic 120 mmhg diastolic 80 pulse 72 patient lab report');
    expect(medResult.isMedical).toBe(true);
    expect(medResult.score).toBeGreaterThanOrEqual(2);

    const lectureResult = classifyMedicalDocument('syllabus semester algorithm database management class notes big data');
    expect(lectureResult.isMedical).toBe(false);
    expect(lectureResult.nonMedicalScore).toBeGreaterThanOrEqual(2);
  });
});

describe('Database Persistence & Role-Based Access for Medical Reports', () => {
  const doctorUser = { id: 'user-demo-doctor', role: 'doctor', name: 'Dr. Ramesh Kumar' };
  const caretakerUser = { id: 'user-demo-caretaker', role: 'caretaker', name: 'Demo Caretaker', assignedElderIds: ['elder-1'] };
  const guardianUser = { id: 'user-demo-guardian', role: 'guardian', name: 'Guardian User', profile: { elderName: 'Usha' }, assignedElderIds: ['elder-1'] };
  const otherGuardian = { id: 'user-other-guardian', role: 'guardian', name: 'Other Guardian', profile: { elderName: 'Unrelated Patient' }, assignedElderIds: ['unrelated-elder'] };

  it('persists medical report with file data and allows retrieval with full document', async () => {
    const dummyFileData = Buffer.from('%PDF-1.4 sample clinical content').toString('base64');
    const saved = await dbService.createReport(
      doctorUser,
      'elder-1',
      'Cardiac Echo Evaluation',
      'Normal ejection fraction 62%, mild trace mitral regurgitation.',
      'ECG / Cardiology',
      'cardiac_echo.pdf',
      'cardiac_echo.pdf',
      dummyFileData,
      'application/pdf',
      dummyFileData.length
    );

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe('Cardiac Echo Evaluation');
    expect(saved.elderId).toBe('elder-1');

    // List reports (should return metadata)
    const reports = await dbService.getReports('elder-1');
    const found = reports.find((r: any) => r.id === saved.id);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Cardiac Echo Evaluation');

    // Get report by ID (should return fileData for streaming/download)
    const fullReport = await dbService.getReportById(saved.id);
    expect(fullReport).toBeDefined();
    expect(fullReport?.fileData).toBe(dummyFileData);
  });

  it('enforces RBAC so only authorized users can access the elder reports', async () => {
    // Caretaker assigned to elder-1 can access
    const caretakerOwns = await dbService.userOwnsElder(caretakerUser, 'elder-1');
    expect(caretakerOwns).toBe(true);

    // Doctor assigned to elder-1 can access
    const doctorOwns = await dbService.userOwnsElder(doctorUser, 'elder-1');
    expect(doctorOwns).toBe(true);

    // Guardian assigned to Usha (elder-1) can access
    const guardianOwns = await dbService.userOwnsElder(guardianUser, 'elder-1');
    expect(guardianOwns).toBe(true);

    // Other guardian with unrelated elder CANNOT access elder-1
    const otherOwns = await dbService.userOwnsElder(otherGuardian, 'elder-1');
    expect(otherOwns).toBe(false);
  });
});
