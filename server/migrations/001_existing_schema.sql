CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        phone VARCHAR(50),
        profile JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS elders (
        id VARCHAR(100) PRIMARY KEY,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        age INTEGER,
        medical_conditions JSONB,
        language_pref VARCHAR(50),
        connection_status VARCHAR(50),
        battery INTEGER,
        last_vitals_at TIMESTAMP WITH TIME ZONE,
        baselines_learned BOOLEAN DEFAULT FALSE,
        baseline_day INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS user_elders (
        user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, elder_id)
      );

CREATE TABLE IF NOT EXISTS medications (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        brand_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category VARCHAR(100),
        dose_amount NUMERIC,
        dose_unit VARCHAR(50),
        frequency VARCHAR(255),
        times JSONB,
        instructions TEXT,
        photo TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS alarms (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        time VARCHAR(50) NOT NULL,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Scheduled',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS vitals_readings (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        heart_rate INTEGER,
        systolic_bp INTEGER,
        diastolic_bp INTEGER,
        spo2 INTEGER,
        stress INTEGER,
        hydration INTEGER,
        breathing_rate INTEGER,
        skin_temp NUMERIC,
        shiver_detected BOOLEAN DEFAULT FALSE,
        panic_detected BOOLEAN DEFAULT FALSE,
        fall_detected BOOLEAN DEFAULT FALSE,
        source VARCHAR(50) DEFAULT 'manual',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS clinical_notes (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        doctor_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        doctor_name VARCHAR(255),
        note TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        doctor_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        doctor_name VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        file_data TEXT,
        file_type VARCHAR(100),
        file_size INTEGER,
        category VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_data TEXT;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_size INTEGER;;

CREATE TABLE IF NOT EXISTS alerts (
        id VARCHAR(100) PRIMARY KEY,
        elder_id VARCHAR(100) REFERENCES elders(id) ON DELETE CASCADE,
        owner_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        location VARCHAR(255),
        resolved BOOLEAN DEFAULT FALSE,
        time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS anomaly_type VARCHAR(100);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS episode_recovered BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        role VARCHAR(50),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_id VARCHAR(255) PRIMARY KEY,
        revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
