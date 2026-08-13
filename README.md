# G-Care: Guardian remote elder care dashboard & clinic portal

G-Care is a production-ready, full-stack remote monitoring application designed for elderly care. It enables caretakers, guardians, and medical staff to track real-time patient vitals, schedule medication alarms, manage critical alerts (like fall detection and geofence breaches), and coordinate care through a dedicated clinical workspace.

---

## 🌟 Key Core Features

### 1. Unified Caretaker Dashboard
* **Real-time Vitals Grids**: Monitor Heart Rate, SpO2, Blood Pressure, Stress, and Hydration levels.
* **Manual Vitals Logging**: Interface for logging fresh metrics when offline or using non-connected devices.
* **Medication Scheduler**: Interface with smart frequency planners (e.g. *once daily*, *twice daily*) and exact timing selectors.
* **Alarm Reminders**: Log activity, food, and appointment alerts.
* **TV Feed Simulator**: Isolated test framework showing watch alerts, location triggers, and daily reminders in real-time.

### 2. Specialized Doctor Portal (Clinical Workspace)
* **Clinical Report Uploads**: Interface for uploading medical records (Complete Blood Counts, ECGs, Scans, Prescriptions) categorized by type.
* **Report History Preview**: Document repository for each patient with diagnostic comments, file attachment lookups, and visual badges.
* **Care Team Directory**: Dynamic directory listing the clinicians, cardiologist specialists, and clinics associated with each elder profile.
* **Recommendations Log**: Text editor to save persistent clinical notes and prescribe follow-up treatments.

### 3. Guardian Portal
* **Reminders Checklist**: Allows guardians to review medication schedules and check off taken doses.
* **Active Logs**: Timeline tracing daily routines, alarms, and watch responses.
* **Emergency SOS Center**: Fast panels to trigger immediate emergency protocols.

---

## 🛠 Tech Stack

* **Frontend**: React 18, TypeScript, Vite 8, Recharts, React Leaflet, Tailwind CSS, shadcn/ui.
* **Backend**: Node.js, Express, Zod (type-safe validation), JSON Web Tokens (JWT).
* **Database**: PostgreSQL (production-ready) with a local JSON DB fallback (`data/db.json`) for seamless zero-config local testing.
* **Deployment**: Render Blueprint (`render.yaml`) with linked PostgreSQL databases.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* [PostgreSQL](https://www.postgresql.org/) (Optional, local file storage is used by default if omitted)

### Installation
1. Clone the repository.
2. Install dependencies (using `--legacy-peer-deps` to resolve tagger packages):
   ```bash
   npm install --legacy-peer-deps
   ```
3. Set up environment variables by copying the example template:
   ```bash
   cp .env.example .env
   ```

### Running Locally
To launch G-Care in development mode (with hot reloading):
```bash
npm run dev
```

To verify production compiling and run the backend HTTP server:
```bash
npm run build
npm start
```
The application will be accessible at [http://127.0.0.1:8787](http://127.0.0.1:8787).

---

## 🔒 Security & API Integration

* **Role-Based Access Control (RBAC)**: Enforced via async middleware (`requireRole(['doctor', 'caretaker', 'guardian'])`) mapping user IDs to specific resources.
* **JWT & Token Revocation**: Secure login tokens that are automatically revoked in database memory upon user logout to block re-use.
* **Zod Schemas**: Strict validation on all CRUD endpoints (`/api/vitals`, `/api/medications`, `/api/reports`, `/api/clinical-notes`).

---

## 📂 Project Structure

```
├── data/                 # JSON file fallback database (db.json)
├── server/               # Node.js backend source code
│   ├── auth.js           # Password hashing & JWT signing helpers
│   ├── db.js             # PostgreSQL Pool setup, schemas & seeds
│   ├── handlers.js       # Zod schemas, API endpoint route handlers
│   ├── http.js           # Auth middlewares & request parser helpers
│   └── index.js          # Express app entrypoint & port listener
├── src/                  # React client source code
│   ├── components/       # Reusable UI widgets & watch simulators
│   ├── pages/            # View components (Dashboard, DoctorPortal, etc.)
│   ├── store/            # Zustand global state management
│   └── index.css         # Styling directives & base transitions
├── render.yaml           # Deployment blueprint configuration
└── package.json          # Node dependency definitions
```

---

## 🩺 Demo Credentials (Local Fallback)
For local testing, the application seeds the following default accounts automatically:

* **Doctor Portal Access**:
  * **Email**: `dr.ramesh@apollo.in`
  * **Password**: `Demo1234!`
* **Caretaker Dashboard Access**:
  * **Email**: `demo@guardianwatch.in`
  * **Password**: `Demo1234!`
