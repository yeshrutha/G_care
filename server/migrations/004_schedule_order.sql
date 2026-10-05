ALTER TABLE medication_schedules ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
UPDATE medication_schedules s SET position=t.ordinality-1 FROM medications m CROSS JOIN LATERAL jsonb_array_elements_text(m.times) WITH ORDINALITY AS t(time,ordinality) WHERE s.medication_id=m.id AND s.time=t.time;
