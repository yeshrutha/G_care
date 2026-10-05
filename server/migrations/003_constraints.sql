CREATE UNIQUE INDEX IF NOT EXISTS one_open_physiological_alert ON alerts(elder_id,anomaly_type) WHERE anomaly_type IS NOT NULL AND NOT resolved AND NOT episode_recovered;
ALTER TABLE users ADD CONSTRAINT users_known_role CHECK(role IN ('doctor','caretaker','guardian')) NOT VALID;
ALTER TABLE medications ADD CONSTRAINT medication_patient_required CHECK(elder_id IS NOT NULL) NOT VALID;
ALTER TABLE alarms ADD CONSTRAINT alarm_patient_required CHECK(elder_id IS NOT NULL) NOT VALID;
ALTER TABLE alerts ADD CONSTRAINT alert_patient_required CHECK(elder_id IS NOT NULL) NOT VALID;
ALTER TABLE vitals_readings ADD CONSTRAINT spo2_range CHECK(spo2 >= 0 AND spo2 <= 100) NOT VALID;
