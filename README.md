# RegIntel AI Compliance Prototype

This is a self-contained working model of an AI-powered Agentic Regulatory Intelligence and Compliance Management Platform for banking.

## How to run with backend

Open the folder in VS Code, then run:

```powershell
python backend/server.py
```

Open:

```text
http://127.0.0.1:8000/index.html
```

Backend API endpoints:

- `GET /api/health`
- `GET /api/state`
- `GET /api/firebase-status`
- `GET /api/users`
- `POST /api/login`
- `POST /api/analyze`
- `POST /api/save-maps`
- `POST /api/update-map`
- `POST /api/upload-evidence`
- `POST /api/firebase-sync`
- `POST /api/train`
- `POST /api/classify`
- `POST /api/validate-evidence`
- `POST /api/ollama`

Local backend data is stored in:

```text
backend/data/regintel_db.json
```

Demo users:

| User | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `compliance` | `compliance123` | Compliance Officer |
| `it` | `it123` | Department User |
| `legal` | `legal123` | Department User |
| `risk` | `risk123` | Department User |
| `operations` | `ops123` | Department User |
| `audit` | `audit123` | Auditor |

Firebase Authentication:

1. In Firebase Console, go to **Build > Authentication**.
2. Click **Get started** if prompted.
3. Open **Sign-in method**.
4. Enable **Email/Password**.
5. Save.

New users can register from the app login screen using an email and password. Their role and department are saved in Firestore collection:

```text
regintel_demo_user_profiles
```

## How to run frontend only

Open `index.html` in a browser. No API keys, server, or package installation are required.

For the local LLM feature, run it through a local server:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173/index.html
```

## What works in this prototype

- The app starts with zero data, zero MAPs, and no audit history.
- Regulatory document ingestion with sample RBI circular text.
- Clause extraction and metadata display.
- Regulation diff visualization against a previous version.
- MAP generation with task, section, deadline, priority, risk score, and department routing.
- Dashboard metrics and department-wise compliance heatmap.
- Evidence validation with Pass, Fail, or Needs Review decisions.
- Role login and department dashboard.
- Backend-backed MAP status workflow.
- Evidence file upload metadata.
- Explainability text for routing and evidence decisions.
- Regulator-ready audit trail and multiple PDF report exports.
- Multi-agent architecture view.
- Free in-browser trainable routing model.
- Optional free local LLM connector using Ollama.

## Free LLM option

This project avoids paid API keys. To use a local LLM:

1. Install Ollama from `https://ollama.com`.
2. Pull a small model:

```powershell
ollama pull llama3.2
```

3. Start Ollama:

```powershell
ollama serve
```

4. Open the app, go to **Free AI Lab**, and click **Ask local LLM**.

Good free model choices for student laptops:

- `llama3.2`
- `mistral`
- `gemma2:2b`
- `phi3`

## Training option

The **Free AI Lab** includes a small browser-based Naive Bayes classifier trained on labeled compliance clauses. It can route MAPs to Compliance, Legal, Risk, Operations, Audit, or IT without any paid service.

## Optional Firebase backend

This project also supports Firebase Firestore as a free cloud backend.

Files:

- `firebase-config.js`: paste your Firebase web app config here.
- `firebase-service.js`: connects the app to Firestore.

Setup:

1. Go to `https://console.firebase.google.com`.
2. Create a Firebase project on the free Spark plan.
3. Open **Project Settings > General**.
4. Add a **Web App**.
5. Copy the `firebaseConfig` values.
6. Paste them into `firebase-config.js`.
7. Change:

```js
useFirebase: false
```

to:

```js
useFirebase: true
```

8. In Firebase Console, go to **Build > Firestore Database**.
9. Create a Firestore database. For demo use, test mode is easiest.
10. Run the project with:

```powershell
python backend/server.py
```

11. Open:

```text
http://127.0.0.1:8000/index.html
```

12. Go to **Free AI Lab > Firebase backend** and click **Test Firebase**.

Firestore collections used:

- `regintel_demo_audit_events`
- `regintel_demo_analysis_runs`
- `regintel_demo_evidence_reviews`
- `regintel_demo_training_runs`
- `regintel_demo_snapshots`

## Test documents

Use files in `test-documents/` to test every major button:

- `01-rbi-cyber-resilience-current.txt`: upload or paste into Document Ingestion, then click Analyze Document.
- `02-sebi-investor-protection-notification.txt`: test Legal, Compliance, Operations, and Audit routing.
- `03-internal-audit-guideline.txt`: test Audit and Risk routing.
- `04-policy-amendment-operations.txt`: test Operations, IT, Risk, and Compliance routing.
- `05-evidence-pass-example.txt`: paste into Evidence Validation for a likely Pass result.
- `06-evidence-fail-example.txt`: paste into Evidence Validation for a likely Fail or Needs Review result.
- `07-llm-prompt-example.txt`: paste into Free AI Lab local LLM prompt.

## Prototype note

The core AI behavior is deterministic and local so the model works offline. In a production build, the parsing, RAG retrieval, embeddings, LLM generation, OCR, and evidence validation layers can be connected to services such as FastAPI, PostgreSQL, ChromaDB, PyMuPDF, Tesseract, Sentence Transformers, FinBERT/Legal-BERT, and local Ollama-hosted LLMs.
