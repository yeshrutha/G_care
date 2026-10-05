ALTER TABLE vitals_readings ALTER COLUMN spo2 TYPE NUMERIC(5,2);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS appointment_details JSONB;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS appointment_id VARCHAR(100);
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS appointment_date TEXT;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS appointment_time TEXT;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS is_one_hour_reminder BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS repeat TEXT NOT NULL DEFAULT 'daily';
CREATE TABLE IF NOT EXISTS appointments (
 id VARCHAR(100) PRIMARY KEY, elder_id VARCHAR(100) NOT NULL REFERENCES elders(id),
 doctor_id VARCHAR(100) REFERENCES users(id), appointment_date TEXT NOT NULL,
 appointment_time TEXT NOT NULL, doctor_name TEXT, notes TEXT,
 status TEXT NOT NULL DEFAULT 'booked', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(elder_id, doctor_id, appointment_date, appointment_time)
);
CREATE TABLE IF NOT EXISTS medication_schedules (
 medication_id VARCHAR(100) NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
 time TEXT NOT NULL, PRIMARY KEY(medication_id,time)
);
CREATE TABLE IF NOT EXISTS reminder_acknowledgements (
 elder_id VARCHAR(100) NOT NULL REFERENCES elders(id), reminder_id TEXT NOT NULL,
 occurrence_date DATE NOT NULL, user_id VARCHAR(100) NOT NULL REFERENCES users(id),
 acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(elder_id,reminder_id,occurrence_date)
);
CREATE INDEX IF NOT EXISTS vitals_patient_time ON vitals_readings(elder_id,timestamp DESC);
CREATE INDEX IF NOT EXISTS alerts_patient_episode ON alerts(elder_id,anomaly_type,time DESC);
CREATE INDEX IF NOT EXISTS alerts_patient_status ON alerts(elder_id,resolved);
CREATE INDEX IF NOT EXISTS medications_patient ON medications(elder_id);
CREATE INDEX IF NOT EXISTS alarms_patient ON alarms(elder_id);
CREATE INDEX IF NOT EXISTS records_patient_time ON reports(elder_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notes_patient_time ON clinical_notes(elder_id,created_at DESC);
CREATE INDEX IF NOT EXISTS assignments_patient ON user_elders(elder_id,user_id);
CREATE INDEX IF NOT EXISTS appointments_patient ON appointments(elder_id,appointment_date);
CREATE TABLE IF NOT EXISTS data_imports (source_digest TEXT PRIMARY KEY, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), counts JSONB NOT NULL);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_path TEXT;

CREATE TABLE IF NOT EXISTS vitals_latest (LIKE vitals_readings INCLUDING DEFAULTS);
ALTER TABLE vitals_latest ADD PRIMARY KEY(elder_id);
ALTER TABLE vitals_latest ADD FOREIGN KEY(elder_id) REFERENCES elders(id) ON DELETE CASCADE;
