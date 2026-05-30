from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime
import base64
import json
import math
import re
import zipfile
import xml.etree.ElementTree as ET
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "backend" / "data"
DB_FILE = DATA_DIR / "regintel_db.json"
FIREBASE_CONFIG_FILE = ROOT / "firebase-config.js"
DEPARTMENTS = ["Compliance", "Legal", "Risk", "Operations", "Audit", "IT"]
USERS = [
    {"username": "admin", "password": "admin123", "role": "Admin", "department": "All", "name": "Admin User"},
    {"username": "compliance", "password": "compliance123", "role": "Compliance Officer", "department": "Compliance", "name": "Compliance Officer"},
    {"username": "it", "password": "it123", "role": "Department User", "department": "IT", "name": "IT User"},
    {"username": "legal", "password": "legal123", "role": "Department User", "department": "Legal", "name": "Legal User"},
    {"username": "risk", "password": "risk123", "role": "Department User", "department": "Risk", "name": "Risk User"},
    {"username": "operations", "password": "ops123", "role": "Department User", "department": "Operations", "name": "Operations User"},
    {"username": "audit", "password": "audit123", "role": "Auditor", "department": "Audit", "name": "Auditor"},
]
STATUS_FLOW = ["Open", "In Progress", "Evidence Submitted", "Needs Review", "Complete"]

KEYWORD_DEPARTMENTS = [
    {"dept": "IT", "words": ["cyber", "system", "vulnerability", "digital", "third-party", "incident"]},
    {"dept": "Risk", "words": ["risk", "resilience", "impact", "critical", "exposure"]},
    {"dept": "Operations", "words": ["customer", "service", "disruption", "communication"]},
    {"dept": "Audit", "words": ["audit", "evidence", "preserved", "testing"]},
    {"dept": "Legal", "words": ["policy", "board", "approved", "governance"]},
    {"dept": "Compliance", "words": ["rbi", "reserve bank", "reported", "regulation"]},
]
REGULATORY_KEYWORDS = [
    "rbi", "reserve bank", "sebi", "circular", "notification", "regulation", "regulatory",
    "compliance", "audit", "policy", "guideline", "obligation", "deadline", "risk",
    "bank", "banks", "financial institution", "control", "evidence", "governance",
    "section", "shall", "must", "reporting", "submission", "supervisory", "inspection",
]
BANKING_DOMAIN_KEYWORDS = [
    "rbi", "reserve bank", "sebi", "bank", "banks", "banking", "financial institution",
    "nbfc", "payment system", "credit", "deposit", "branch", "customer account",
    "kyc", "aml", "basel", "capital adequacy", "liquidity", "lending", "loan",
]
NON_REGULATORY_KEYWORDS = [
    "resume", "curriculum vitae", "education", "skills", "experience", "projects",
    "objective", "linkedin", "github", "internship", "cgpa", "certification",
    "hobbies", "profile summary", "employment history",
]
DOCUMENT_CLASSIFIER = [
    {
        "label": "banking_regulatory",
        "weight": 1.25,
        "terms": [
            "rbi", "reserve bank", "sebi", "bank", "banks", "banking", "nbfc", "financial institution",
            "payment system", "kyc", "aml", "circular", "notification", "supervisory", "regulatory return",
            "customer account", "digital banking", "operational resilience",
        ],
    },
    {
        "label": "regulatory_obligation",
        "weight": 1,
        "terms": [
            "section", "clause", "para", "must", "shall", "compliance", "obligation", "statutory",
            "audit", "evidence", "records", "retained", "retention", "deadline", "within", "approval",
            "documentation", "policy", "control", "review", "reported", "submitted", "implementation",
        ],
    },
    {
        "label": "non_regulatory",
        "weight": 1.5,
        "terms": [
            "resume", "curriculum vitae", "education", "skills", "portfolio", "github", "linkedin",
            "objective", "hobbies", "internship", "cgpa", "personal profile", "career summary",
        ],
    },
]
DEFAULT_DOCUMENT_TRAINING = [
    ("RBI circular requires banks to report material cyber incidents within 6 hours", "banking_regulatory"),
    ("Reserve Bank notification on digital banking resilience and third party risk controls", "banking_regulatory"),
    ("SEBI notification requires regulated entities to preserve audit evidence", "banking_regulatory"),
    ("NBFC must submit regulatory returns and board approved policy updates", "banking_regulatory"),
    ("Banks shall maintain KYC AML monitoring records and suspicious transaction reporting", "banking_regulatory"),
    ("Payment system operators must preserve customer dispute resolution evidence", "banking_regulatory"),
    ("Section 1 compliance officers must verify statutory records and retain evidence", "regulatory_obligation"),
    ("Clause 2 implementation proof must be submitted within seven business days", "regulatory_obligation"),
    ("Para 3 audit teams shall review unresolved statutory gaps monthly", "regulatory_obligation"),
    ("The department must upload approval confirmations and control testing records", "regulatory_obligation"),
    ("Evidence of implementation must be maintained for regulator inspection", "regulatory_obligation"),
    ("Policy owner shall review the governance procedure and document exceptions", "regulatory_obligation"),
    ("Resume education skills projects internship github linkedin portfolio", "non_regulatory"),
    ("Curriculum vitae objective work experience programming languages and hobbies", "non_regulatory"),
    ("College assignment about machine learning project and personal profile", "non_regulatory"),
    ("Software developer portfolio with certifications and academic marks", "non_regulatory"),
]
DEFAULT_DEPARTMENT_TRAINING = [
    ("cyber security vulnerability incident digital systems root cause outage integration", "IT"),
    ("internet facing application access control backup disaster recovery technology", "IT"),
    ("third party API monitoring encryption authentication firewall patching", "IT"),
    ("legal policy board approved governance contract clause amendment", "Legal"),
    ("outsourcing agreement vendor contract regulatory interpretation legal review", "Legal"),
    ("customer service disruption branch communication complaint resolution operations", "Operations"),
    ("SOP process turnaround customer notice operational workflow branch teams", "Operations"),
    ("audit evidence control testing inspection proof records retained", "Audit"),
    ("internal audit closure observation evidence validation audit trail", "Audit"),
    ("risk exposure material impact critical severity resilience financial loss", "Risk"),
    ("enterprise risk committee operational risk scenario impact assessment", "Risk"),
    ("RBI reporting regulatory return compliance tracker circular implementation", "Compliance"),
    ("SEBI notification compliance officer obligation deadline submission", "Compliance"),
]
DEFAULT_PRIORITY_TRAINING = [
    ("within 6 hours material cyber incident reserve bank critical immediate", "High"),
    ("financial penalty customer impact severe outage regulatory breach deadline tomorrow", "High"),
    ("board accountable officer deadline 30 june critical exposure", "High"),
    ("monthly assessment review policy update control testing", "Medium"),
    ("submit evidence within 14 days department confirmation", "Medium"),
    ("quarterly report governance procedure update", "Medium"),
    ("annual review archive records routine documentation", "Low"),
    ("minor policy clarification reference update", "Low"),
]

TRAINED_MODEL = None
DEFAULT_ML_MODELS = None


def default_db():
    return {
        "maps": [],
        "evidence": [],
        "audit": [],
        "uploads": [],
        "users": [{k: v for k, v in user.items() if k != "password"} for user in USERS],
        "sources": [],
        "reminders": [],
        "approvals": [],
    }


def load_db():
    DATA_DIR.mkdir(exist_ok=True)
    if not DB_FILE.exists():
        save_db(default_db())
    try:
        return json.loads(DB_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default_db()


def save_db(db):
    DATA_DIR.mkdir(exist_ok=True)
    DB_FILE.write_text(json.dumps(db, indent=2), encoding="utf-8")


def audit_event(actor, action, detail):
    db = load_db()
    event = {"actor": actor, "action": action, "detail": detail}
    db.setdefault("audit", []).insert(0, event)
    save_db(db)
    return event


def firebase_config():
    if not FIREBASE_CONFIG_FILE.exists():
        return None
    text = FIREBASE_CONFIG_FILE.read_text(encoding="utf-8")
    if "useFirebase: true" not in text:
        return None
    api_key = re.search(r'apiKey:\s*"([^"]+)"', text)
    project_id = re.search(r'projectId:\s*"([^"]+)"', text)
    prefix = re.search(r'collectionPrefix:\s*"([^"]+)"', text)
    if not api_key or not project_id:
        return None
    return {
        "apiKey": api_key.group(1),
        "projectId": project_id.group(1),
        "prefix": prefix.group(1) if prefix else "regintel_demo",
    }


def firestore_value(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [firestore_value(item) for item in value[:200]]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {str(k): firestore_value(v) for k, v in list(value.items())[:200]}}}
    if value is None:
        return {"nullValue": None}
    return {"stringValue": str(value)}


def firestore_write(collection_name, payload):
    config = firebase_config()
    if not config:
        return {"enabled": False, "error": "Firebase backend config is not enabled."}

    collection = f"{config['prefix']}_{collection_name}"
    url = (
        f"https://firestore.googleapis.com/v1/projects/{config['projectId']}"
        f"/databases/(default)/documents/{collection}?key={config['apiKey']}"
    )
    body = json.dumps(
        {
            "fields": {
                "createdAt": {"timestampValue": datetime.utcnow().isoformat(timespec="seconds") + "Z"},
                "source": {"stringValue": "python_backend"},
                "payload": firestore_value(payload),
            }
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
            return {"enabled": True, "id": data.get("name", "").split("/")[-1], "collection": collection}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return {"enabled": True, "error": f"Firestore HTTP {exc.code}: {detail}"}
    except urllib.error.URLError as exc:
        return {"enabled": True, "error": f"Firestore unreachable: {exc}"}


def sync_backend_to_firebase():
    db = load_db()
    return firestore_write(
        "backend_snapshots",
        {
            "maps": db.get("maps", []),
            "evidence": db.get("evidence", []),
            "audit": db.get("audit", []),
            "uploads": db.get("uploads", []),
            "users": db.get("users", []),
            "metrics": {
                "mapCount": len(db.get("maps", [])),
                "evidenceCount": len(db.get("evidence", [])),
                "auditCount": len(db.get("audit", [])),
                "uploadCount": len(db.get("uploads", [])),
            },
        },
    )


def extract_docx_text(content):
    try:
        from io import BytesIO

        with zipfile.ZipFile(BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
        root = ET.fromstring(xml)
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        paragraphs = []
        for paragraph in root.findall(".//w:p", namespace):
            text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)).strip()
            if text:
                paragraphs.append(text)
        return "\n".join(paragraphs)
    except Exception as exc:
        return f"Could not extract DOCX text: {exc}"


def extract_pdf_text(content):
    try:
        import pypdf  # type: ignore
        from io import BytesIO

        reader = pypdf.PdfReader(BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        decoded = content.decode("latin-1", errors="ignore")
        chunks = re.findall(r"\(([^()]{8,})\)\s*Tj", decoded)
        if chunks:
            return "\n".join(chunk.replace("\\)", ")").replace("\\(", "(") for chunk in chunks[:300])
        return "PDF text extraction needs the free pypdf package for this file. Install with: python -m pip install pypdf"


def extract_uploaded_text(file_name, data_url):
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    content = base64.b64decode(data_url)
    lower = file_name.lower()
    if lower.endswith(".txt") or lower.endswith(".csv"):
        return content.decode("utf-8", errors="replace")
    if lower.endswith(".docx"):
        return extract_docx_text(content)
    if lower.endswith(".pdf"):
        return extract_pdf_text(content)
    return content.decode("utf-8", errors="replace")


def source_feed():
    return [
        {
            "id": "SRC-001",
            "source": "RBI",
            "title": "Digital Banking Resilience Circular",
            "date": "2026-05-21",
            "url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx",
            "summary": "Cyber incident reporting, vulnerability assessment, evidence retention, and accountable officer requirements.",
            "sampleText": "RBI/2026-27/18 Digital Banking Resilience Circular\nSection 1: Banks must maintain a board-approved cyber security policy and review it every six months.\nSection 2: Material cyber incidents must be reported to the Reserve Bank within 6 hours.\nSection 3: Evidence of control testing must be preserved for audit review for at least eight years.",
        },
        {
            "id": "SRC-002",
            "source": "SEBI",
            "title": "Investor Grievance Evidence Notification",
            "date": "2026-05-17",
            "url": "https://www.sebi.gov.in/legal/circulars",
            "summary": "Evidence preservation and customer communication requirements for regulated entities.",
            "sampleText": "SEBI/HO/2026 Investor Grievance Notification\nSection 1: Regulated entities must preserve investor grievance closure evidence for audit review.\nSection 2: Customer communication must be issued within 7 days for unresolved complaints.",
        },
    ]


def build_reminders(maps):
    reminders = []
    for item in maps:
        if item.get("status") == "Complete":
            continue
        priority = item.get("priority", "Low")
        cadence = "Daily" if priority == "High" else "Every 3 days" if priority == "Medium" else "Weekly"
        reminders.append(
            {
                "mapId": item.get("id"),
                "department": item.get("department"),
                "cadence": cadence,
                "message": f"{cadence} reminder to {item.get('department')} for {item.get('id')}: {item.get('task')}",
            }
        )
    return reminders


def explain_map(map_item):
    text = map_item.get("source", "")
    return {
        "mapId": map_item.get("id"),
        "model": "Local ML + rule safety layer",
        "departmentReason": routing_reason(map_item.get("department", "Compliance"), text),
        "riskReason": f"Risk {map_item.get('risk')} from deadline, materiality, customer/regulator impact, and evidence terms.",
        "signals": extract_keywords(text),
        "sourceTrace": text,
    }


def compare_model_outputs(text):
    clauses = parse_clauses(text) or [{"id": "CL-001", "section": "Detected obligation", "text": text[:800], "keywords": extract_keywords(text)}]
    fast_maps = generate_maps(clauses)
    big_available = False
    big_error = None
    big_maps = []
    result = ollama_generate_analysis(text, clauses, "llama3.2")
    if result.get("maps"):
        big_available = True
        fallback = generate_maps(clauses)
        big_maps = result["maps"] + fallback[len(result["maps"]):]
    elif result.get("error"):
        big_error = result["error"]
    return {
        "clauses": len(clauses),
        "fastModel": {"name": "Local ML classifier", "mapCount": len(fast_maps), "maps": fast_maps},
        "bigModel": {"name": "Ollama llama3.2", "available": big_available, "error": big_error, "mapCount": len(big_maps), "maps": big_maps},
    }


def json_response(handler, status, payload):
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length).decode("utf-8") if length else "{}"
    return json.loads(raw or "{}")


def tokenize(text):
    stop_words = {
        "section", "clause", "para", "must", "shall", "should", "within", "with",
        "from", "that", "this", "these", "those", "their", "there", "where",
        "have", "been", "being", "will", "and", "for", "the", "are", "into",
    }
    return [
        word
        for word in re.sub(r"[^a-z0-9\s-]", " ", text.lower()).split()
        if len(word) > 3 and word not in stop_words
    ]


def extract_keywords(text):
    return tokenize(text)[:8]


def train_text_classifier(rows):
    labels = sorted({label for _, label in rows})
    model = {
        "labels": labels,
        "docs": {label: 0 for label in labels},
        "words": {label: {} for label in labels},
        "totals": {label: 0 for label in labels},
        "vocabulary": set(),
        "rowCount": len(rows),
    }
    for text, label in rows:
        model["docs"][label] += 1
        for word in tokenize(text):
            model["vocabulary"].add(word)
            model["words"][label][word] = model["words"][label].get(word, 0) + 1
            model["totals"][label] += 1
    model["vocabulary"] = sorted(model["vocabulary"])
    return model


def predict_text_classifier(model, text):
    words = tokenize(text)
    vocab_size = max(len(model["vocabulary"]), 1)
    total_docs = max(model["rowCount"], 1)
    scores = []
    for label in model["labels"]:
        prior = math.log((model["docs"][label] + 1) / (total_docs + len(model["labels"])))
        likelihood = 0
        for word in words:
            count = model["words"][label].get(word, 0)
            likelihood += math.log((count + 1) / (model["totals"][label] + vocab_size))
        scores.append({"label": label, "score": prior + likelihood})
    scores.sort(key=lambda item: item["score"], reverse=True)
    if len(scores) == 1:
        confidence = 100
    else:
        confidence = round(min(98, max(42, (scores[0]["score"] - scores[1]["score"] + 4) * 16)))
    return {"label": scores[0]["label"], "confidence": confidence, "scores": scores}


def get_default_ml_models():
    global DEFAULT_ML_MODELS
    if DEFAULT_ML_MODELS is None:
        DEFAULT_ML_MODELS = {
            "document": train_text_classifier(DEFAULT_DOCUMENT_TRAINING),
            "department": train_text_classifier(DEFAULT_DEPARTMENT_TRAINING),
            "priority": train_text_classifier(DEFAULT_PRIORITY_TRAINING),
        }
    return DEFAULT_ML_MODELS


def token_cosine_similarity(left, right):
    left_counts = {}
    right_counts = {}
    for word in tokenize(left):
        left_counts[word] = left_counts.get(word, 0) + 1
    for word in tokenize(right):
        right_counts[word] = right_counts.get(word, 0) + 1
    if not left_counts or not right_counts:
        return 0
    dot = sum(left_counts.get(word, 0) * right_counts.get(word, 0) for word in set(left_counts) | set(right_counts))
    left_norm = math.sqrt(sum(value * value for value in left_counts.values()))
    right_norm = math.sqrt(sum(value * value for value in right_counts.values()))
    return round((dot / max(left_norm * right_norm, 1e-9)) * 100)


def classify_document_locally(text):
    lower = text.lower()
    trained = predict_text_classifier(get_default_ml_models()["document"], text)
    scores = []
    for bucket in DOCUMENT_CLASSIFIER:
        score = sum(bucket["weight"] for term in bucket["terms"] if term in lower)
        scores.append({"label": bucket["label"], "score": score})
    scores.sort(key=lambda item: item["score"], reverse=True)
    top = scores[0] if scores else {"label": "unknown", "score": 0}
    total = sum(item["score"] for item in scores) or 1
    label = trained["label"] if trained["confidence"] >= 50 else top["label"]
    confidence = max(trained["confidence"], round((top["score"] / total) * 100))
    return {
        "label": label,
        "confidence": confidence,
        "scores": scores,
        "trainedScores": trained["scores"],
    }


def parse_clauses(text):
    raw_clauses = []
    current = None
    lines = [line.strip() for line in re.split(r"\n+", text) if line.strip()]
    for line in lines:
        match = re.search(r"^(Section\s+\d+|Clause\s+\d+|Para\s+\d+)\s*:?\s*(.*)$", line, re.I)
        if match:
            if current:
                raw_clauses.append(current)
            current = {"section": re.sub(r"\s+", " ", match.group(1)), "text_parts": []}
            if match.group(2):
                current["text_parts"].append(match.group(2))
            continue
        if current:
            current["text_parts"].append(line)
    if current:
        raw_clauses.append(current)

    clauses = []
    for raw in raw_clauses:
        index = len(clauses) + 1
        clause_text = re.sub(r"\s+", " ", " ".join(raw["text_parts"])).strip()
        clauses.append(
            {
                "id": f"CL-{index:03d}",
                "section": raw["section"],
                "text": clause_text,
                "keywords": extract_keywords(clause_text or raw["section"]),
            }
        )
    return clauses


def assess_document(text):
    lower = text.lower()
    regulatory_hits = sorted({word for word in REGULATORY_KEYWORDS if word in lower})
    banking_hits = sorted({word for word in BANKING_DOMAIN_KEYWORDS if word in lower})
    non_reg_hits = sorted({word for word in NON_REGULATORY_KEYWORDS if word in lower})
    section_count = len(re.findall(r"section\s+\d+|clause\s+\d+|para\s+\d+", lower))
    obligation_hits = sorted(
        {
            word
            for word in [
                "must", "shall", "obligation", "compliance", "within", "deadline",
                "reported", "submitted", "retained", "review", "evidence", "records",
            ]
            if word in lower
        }
    )
    ml = classify_document_locally(text)
    regulatory_score = len(regulatory_hits) + min(section_count, 5)
    banking_score = len(banking_hits)
    non_reg_score = len(non_reg_hits)
    is_regulatory = non_reg_score == 0 and (
        (banking_score >= 1 and regulatory_score >= 3)
        or (ml["label"] == "banking_regulatory" and regulatory_score >= 3)
        or (ml["label"] == "regulatory_obligation" and section_count >= 1 and len(obligation_hits) >= 2 and regulatory_score >= 4)
        or (section_count >= 2 and len(obligation_hits) >= 3 and regulatory_score >= 5)
    )
    if "resume" in lower or "curriculum vitae" in lower:
        is_regulatory = False
    return {
        "isRegulatory": is_regulatory,
        "regulatoryScore": regulatory_score,
        "bankingScore": banking_score,
        "obligationScore": len(obligation_hits),
        "mlLabel": ml["label"],
        "mlConfidence": ml["confidence"],
        "nonRegulatoryScore": non_reg_score,
        "regulatorySignals": sorted(set(regulatory_hits + banking_hits + obligation_hits))[:12],
        "nonRegulatorySignals": non_reg_hits[:12],
        "message": (
            "Banking/regulatory document detected."
            if is_regulatory
            and banking_score >= 1
            else "Regulatory obligation document detected by the local ML classifier."
            if is_regulatory
            else "This does not look like a regulatory obligation document, so MAP generation was blocked. Paste an RBI/SEBI circular or section-wise obligation text."
        ),
    }


def route_department(text):
    global TRAINED_MODEL
    if TRAINED_MODEL:
        return classify_department(text)["department"]
    prediction = predict_text_classifier(get_default_ml_models()["department"], text)
    if prediction["confidence"] >= 50:
        return prediction["label"]
    lower = text.lower()
    ranked = []
    for entry in KEYWORD_DEPARTMENTS:
        score = sum(1 for word in entry["words"] if word in lower)
        ranked.append({"dept": entry["dept"], "score": score})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[0]["dept"] if ranked and ranked[0]["score"] else "Compliance"


def calculate_risk(text):
    lower = text.lower()
    score = 35
    if "within 6 hours" in lower:
        score += 30
    if "30 june 2026" in lower:
        score += 18
    if "must" in lower:
        score += 10
    if "critical" in lower or "material" in lower:
        score += 15
    if "audit" in lower or "reserve bank" in lower:
        score += 12
    if "customer" in lower:
        score += 8
    return min(score, 99)


def priority_from_risk(score, text=""):
    if text:
        prediction = predict_text_classifier(get_default_ml_models()["priority"], text)
        if prediction["confidence"] >= 55:
            if score >= 75 and prediction["label"] == "Low":
                return "Medium"
            if score <= 45 and prediction["label"] == "High":
                return "Medium"
            return prediction["label"]
    if score >= 75:
        return "High"
    if score >= 55:
        return "Medium"
    return "Low"


def action_text(text):
    clean = text.rstrip(".")
    if re.search(r"banks must", clean, re.I):
        return re.sub(r"banks must", "Implement and evidence", clean, flags=re.I)
    if re.search(r"banks should", clean, re.I):
        return re.sub(r"banks should", "Review and document", clean, flags=re.I)
    return f"Assess and document compliance for: {clean}"


def routing_reason(department, text):
    if TRAINED_MODEL:
        prediction = classify_department(text)
        return f"Backend trained classifier predicted {prediction['department']} with {prediction['confidence']}% confidence."
    prediction = predict_text_classifier(get_default_ml_models()["department"], text)
    if prediction["label"] == department:
        return f"Default ML department model predicted {department} with {prediction['confidence']}% confidence."
    reasons = {
        "IT": "Detected cyber, systems, incident, or integration language.",
        "Risk": "Detected resilience, exposure, criticality, or impact language.",
        "Operations": "Detected customer communication or service continuity language.",
        "Audit": "Detected evidence retention, control testing, or audit language.",
        "Legal": "Detected policy, board approval, or governance language.",
    }
    if department in reasons:
        return reasons[department]
    if "reserve bank" in text.lower():
        return "Detected regulatory reporting obligation."
    return "Default compliance ownership for regulatory obligation."


def deadline_for_clause(text, index):
    match = re.search(r"\b(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})\b", text)
    if match:
        return match.group(1)
    return ["7 days", "14 days", "21 days", "30 days", "45 days", "60 days"][index % 6]


def generate_maps(clauses):
    maps = []
    for index, clause in enumerate(clauses):
        risk = calculate_risk(clause["text"])
        department = route_department(clause["text"])
        maps.append(
            {
                "id": f"MAP-{index + 1:03d}",
                "task": action_text(clause["text"]),
                "section": clause["section"],
                "source": clause["text"],
                "department": department,
                "deadline": deadline_for_clause(clause["text"], index),
                "priority": priority_from_risk(risk, clause["text"]),
                "risk": risk,
                "status": "Open",
                "reason": routing_reason(department, clause["text"]),
            }
        )
    return maps


def extract_json_object(text):
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidate = fenced.group(1) if fenced else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(candidate[start : end + 1])
    except json.JSONDecodeError:
        return None


def normalize_llm_map(item, index, fallback_clause):
    source = str(item.get("source") or fallback_clause.get("text", "")).strip()
    risk = item.get("risk", calculate_risk(source))
    try:
        risk = int(risk)
    except (TypeError, ValueError):
        risk = calculate_risk(source)
    department = str(item.get("department") or route_department(source)).strip()
    if department not in DEPARTMENTS:
        department = route_department(source)
    priority = str(item.get("priority") or priority_from_risk(risk, source)).strip().title()
    if priority not in ["High", "Medium", "Low"]:
        priority = priority_from_risk(risk, source)
    return {
        "id": f"MAP-{index + 1:03d}",
        "task": str(item.get("task") or action_text(source)).strip(),
        "section": str(item.get("section") or fallback_clause.get("section", f"Section {index + 1}")).strip(),
        "source": source,
        "department": department,
        "deadline": str(item.get("deadline") or deadline_for_clause(source, index)).strip(),
        "priority": priority,
        "risk": max(1, min(99, risk)),
        "status": "Open",
        "reason": str(item.get("reason") or f"Generated by local Ollama model with fallback validation.").strip(),
    }


def ollama_generate_analysis(text, clauses, model_name):
    compact_clauses = [
        {"section": clause["section"], "text": clause["text"]}
        for clause in clauses[:12]
    ]
    prompt = f"""
You are a banking regulatory compliance analyst for an Indian bank.
Analyze the document and return ONLY valid JSON. No markdown.

Rules:
- Accept RBI, SEBI, banking, NBFC, payment, KYC/AML, audit, statutory, and obligation documents.
- Reject resumes, portfolios, assignments, and unrelated personal documents.
- Create measurable action points only from the given text.
- Departments must be one of: Compliance, Legal, Risk, Operations, Audit, IT.
- Priority must be High, Medium, or Low.
- Risk must be an integer from 1 to 99.

Return this exact schema:
{{
  "isRegulatory": true,
  "documentType": "RBI circular or regulatory obligation",
  "confidence": 88,
  "reason": "short reason",
  "maps": [
    {{
      "section": "Section 1",
      "task": "measurable implementation task",
      "source": "source clause text",
      "department": "Compliance",
      "deadline": "7 days",
      "priority": "Medium",
      "risk": 60,
      "reason": "why routed/scored"
    }}
  ]
}}

Clauses:
{json.dumps(compact_clauses, ensure_ascii=False)}

Full document excerpt:
{text[:5000]}
"""
    result = proxy_ollama({"model": model_name, "prompt": prompt})
    if result.get("error"):
        return {"error": result["error"]}
    parsed = extract_json_object(result.get("response", ""))
    if not parsed:
        return {"error": "Local big model returned non-JSON output."}
    maps = parsed.get("maps", [])
    normalized = []
    if isinstance(maps, list):
        for index, item in enumerate(maps[: max(len(clauses), 1)]):
            fallback_clause = clauses[min(index, len(clauses) - 1)] if clauses else {"section": "Detected obligation", "text": text[:800]}
            if isinstance(item, dict):
                normalized.append(normalize_llm_map(item, index, fallback_clause))
    return {
        "assessment": {
            "isRegulatory": bool(parsed.get("isRegulatory", False)),
            "regulatoryScore": 0,
            "bankingScore": 0,
            "obligationScore": 0,
            "mlLabel": f"ollama:{model_name}",
            "mlConfidence": int(parsed.get("confidence", 70) or 70),
            "nonRegulatoryScore": 0,
            "regulatorySignals": [str(parsed.get("documentType", "local big model"))],
            "nonRegulatorySignals": [],
            "message": str(parsed.get("reason", "Analyzed by local big model.")),
        },
        "maps": normalized,
    }


def parse_training_csv(csv):
    rows = []
    for index, line in enumerate(csv.splitlines()):
        line = line.strip()
        if not line or index == 0:
            continue
        match = re.match(r'^"?(.+?)"?,(Compliance|Legal|Risk|Operations|Audit|IT)$', line, re.I)
        if match:
            department = next((dept for dept in DEPARTMENTS if dept.lower() == match.group(2).lower()), "Compliance")
            rows.append({"clause": match.group(1), "department": department})
    return rows


def train_model(csv):
    rows = parse_training_csv(csv)
    model = {
        "docs": {dept: 0 for dept in DEPARTMENTS},
        "words": {dept: {} for dept in DEPARTMENTS},
        "totals": {dept: 0 for dept in DEPARTMENTS},
        "vocabulary": set(),
        "rowCount": len(rows),
    }
    for row in rows:
        model["docs"][row["department"]] += 1
        for word in tokenize(row["clause"]):
            model["vocabulary"].add(word)
            model["words"][row["department"]][word] = model["words"][row["department"]].get(word, 0) + 1
            model["totals"][row["department"]] += 1
    model["vocabulary"] = sorted(model["vocabulary"])
    return model


def classify_department(text):
    model = TRAINED_MODEL
    if not model:
        prediction = predict_text_classifier(get_default_ml_models()["department"], text)
        return {"department": prediction["label"], "confidence": prediction["confidence"], "scores": prediction["scores"]}
    words = tokenize(text)
    vocab_size = max(len(model["vocabulary"]), 1)
    total_docs = max(model["rowCount"], 1)
    scores = []
    for department in DEPARTMENTS:
        prior = math.log((model["docs"][department] + 1) / (total_docs + len(DEPARTMENTS)))
        likelihood = 0
        for word in words:
            count = model["words"][department].get(word, 0)
            likelihood += math.log((count + 1) / (model["totals"][department] + vocab_size))
        scores.append({"department": department, "score": prior + likelihood})
    scores.sort(key=lambda item: item["score"], reverse=True)
    confidence = round(min(98, max(45, (scores[0]["score"] - scores[1]["score"] + 4) * 18)))
    return {"department": scores[0]["department"], "confidence": confidence, "scores": scores}


def validate_evidence(map_item, evidence_text):
    source_words = set(extract_keywords(map_item.get("source", "")))
    evidence_words = set(extract_keywords(evidence_text))
    matched = sorted(source_words.intersection(evidence_words))
    keyword_coverage = round((len(matched) / max(len(source_words), 1)) * 100)
    semantic_coverage = token_cosine_similarity(map_item.get("source", ""), evidence_text)
    coverage = max(keyword_coverage, semantic_coverage)
    verdict = "Pass" if coverage >= 55 else "Needs Review" if coverage >= 25 else "Fail"
    return {
        "mapId": map_item.get("id", "MAP"),
        "verdict": verdict,
        "coverage": coverage,
        "keywordCoverage": keyword_coverage,
        "semanticCoverage": semantic_coverage,
        "matched": matched,
        "reasoning": f"Backend ML evidence validator found {coverage}% match for {map_item.get('section', 'selected MAP')} using semantic similarity and keyword coverage.",
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            json_response(self, 200, {"status": "ok", "backend": "RegIntel Python backend"})
            return
        if path == "/api/state":
            json_response(self, 200, load_db())
            return
        if path == "/api/firebase-status":
            config = firebase_config()
            json_response(
                self,
                200,
                {
                    "enabled": bool(config),
                    "projectId": config["projectId"] if config else None,
                    "prefix": config["prefix"] if config else None,
                },
            )
            return
        if path == "/api/ml-status":
            models = get_default_ml_models()
            json_response(
                self,
                200,
                {
                    "engine": "free local ML",
                    "models": {
                        "document": {"type": "Multinomial Naive Bayes", "examples": models["document"]["rowCount"], "labels": models["document"]["labels"]},
                        "department": {"type": "Multinomial Naive Bayes", "examples": models["department"]["rowCount"], "labels": models["department"]["labels"]},
                        "priority": {"type": "Multinomial Naive Bayes", "examples": models["priority"]["rowCount"], "labels": models["priority"]["labels"]},
                        "evidence": {"type": "Token cosine semantic similarity", "examples": "runtime comparison"},
                        "bigModel": {"type": "Optional Ollama LLM", "model": "llama3.2 or any local Ollama model"},
                    },
                },
            )
            return
        if path == "/api/users":
            json_response(self, 200, {"users": [{k: v for k, v in user.items() if k != "password"} for user in USERS]})
            return
        if path == "/api/sources":
            json_response(self, 200, {"sources": source_feed()})
            return
        super().do_GET()

    def do_POST(self):
        global TRAINED_MODEL
        path = urlparse(self.path).path
        try:
            payload = read_json(self)
            if path == "/api/login":
                username = payload.get("username", "")
                password = payload.get("password", "")
                user = next((item for item in USERS if item["username"] == username and item["password"] == password), None)
                if not user:
                    json_response(self, 401, {"error": "Invalid username or password"})
                    return
                safe_user = {k: v for k, v in user.items() if k != "password"}
                audit_event(safe_user["name"], "User login", f"{safe_user['role']} logged into the compliance platform.")
                json_response(self, 200, {"user": safe_user})
                return
            if path == "/api/analyze":
                text = payload.get("text", "")
                use_big_model = bool(payload.get("useBigModel", False))
                model_name = payload.get("model", "llama3.2")
                assessment = assess_document(text)
                clauses = parse_clauses(text)
                if not clauses:
                    clauses = [{"id": "CL-001", "section": "Detected obligation", "text": text[:800], "keywords": extract_keywords(text)}]

                llm_analysis = None
                if use_big_model:
                    llm_analysis = ollama_generate_analysis(text, clauses, model_name)
                    if llm_analysis.get("assessment", {}).get("isRegulatory"):
                        assessment = llm_analysis["assessment"]

                if not assessment["isRegulatory"]:
                    json_response(self, 200, {"assessment": assessment, "clauses": [], "maps": [], "blocked": True})
                    return
                fallback_maps = generate_maps(clauses)
                maps = fallback_maps
                if llm_analysis and llm_analysis.get("maps"):
                    maps = llm_analysis["maps"] + fallback_maps[len(llm_analysis["maps"]) :]
                    assessment["message"] = f"{assessment['message']} MAPs generated with local big model."
                elif llm_analysis and llm_analysis.get("error"):
                    assessment["message"] = f"{assessment['message']} Local big model fallback used: {llm_analysis['error']}"
                db = load_db()
                db["maps"] = maps
                db.setdefault("audit", []).insert(0, {"actor": "Backend API", "action": "Analysis persisted", "detail": f"{len(maps)} MAPs saved to local backend database."})
                save_db(db)
                json_response(self, 200, {"assessment": assessment, "clauses": clauses, "maps": maps, "bigModel": bool(llm_analysis and not llm_analysis.get("error"))})
                return
            if path == "/api/extract-document":
                text = extract_uploaded_text(payload.get("fileName", "document.txt"), payload.get("dataUrl", ""))
                json_response(self, 200, {"text": text, "length": len(text)})
                return
            if path == "/api/model-compare":
                json_response(self, 200, compare_model_outputs(payload.get("text", "")))
                return
            if path == "/api/explain-map":
                json_response(self, 200, explain_map(payload.get("map", {})))
                return
            if path == "/api/generate-reminders":
                db = load_db()
                reminders = build_reminders(payload.get("maps") or db.get("maps", []))
                db["reminders"] = reminders
                db.setdefault("audit", []).insert(0, {"actor": "Reminder Agent", "action": "Reminders generated", "detail": f"{len(reminders)} reminders prepared."})
                save_db(db)
                json_response(self, 200, {"reminders": reminders})
                return
            if path == "/api/approve-map":
                db = load_db()
                approval = {
                    "mapId": payload.get("mapId"),
                    "decision": payload.get("decision", "Approved"),
                    "actor": payload.get("actor", "Compliance Officer"),
                    "comment": payload.get("comment", ""),
                    "time": datetime.now().isoformat(timespec="seconds"),
                }
                db.setdefault("approvals", []).insert(0, approval)
                for item in db.get("maps", []):
                    if item.get("id") == approval["mapId"]:
                        item["approval"] = approval["decision"]
                        if approval["decision"] == "Approved":
                            item["status"] = "Complete"
                        elif approval["decision"] == "Rejected":
                            item["status"] = "Needs Review"
                db.setdefault("audit", []).insert(0, {"actor": approval["actor"], "action": f"MAP {approval['decision']}", "detail": f"{approval['mapId']} {approval['decision']}: {approval['comment']}"})
                save_db(db)
                json_response(self, 200, {"approval": approval, "maps": db.get("maps", [])})
                return
            if path == "/api/import-source":
                source = payload.get("source", {})
                db = load_db()
                db.setdefault("sources", []).insert(0, source)
                save_db(db)
                json_response(self, 200, {"source": source, "text": source.get("sampleText", "")})
                return
            if path == "/api/save-maps":
                db = load_db()
                db["maps"] = payload.get("maps", [])
                save_db(db)
                json_response(self, 200, {"ok": True, "count": len(db["maps"])})
                return
            if path == "/api/update-map":
                db = load_db()
                map_id = payload.get("mapId")
                status = payload.get("status")
                actor = payload.get("actor", "User")
                if status not in STATUS_FLOW:
                    json_response(self, 400, {"error": "Invalid status"})
                    return
                updated = None
                for item in db.get("maps", []):
                    if item.get("id") == map_id:
                        item["status"] = status
                        updated = item
                        break
                db.setdefault("audit", []).insert(0, {"actor": actor, "action": "MAP status updated", "detail": f"{map_id} changed to {status}."})
                save_db(db)
                json_response(self, 200, {"map": updated, "maps": db.get("maps", [])})
                return
            if path == "/api/upload-evidence":
                db = load_db()
                upload = {
                    "mapId": payload.get("mapId"),
                    "fileName": payload.get("fileName"),
                    "fileType": payload.get("fileType"),
                    "fileSize": payload.get("fileSize"),
                    "note": payload.get("note", ""),
                    "actor": payload.get("actor", "User"),
                }
                db.setdefault("uploads", []).insert(0, upload)
                for item in db.get("maps", []):
                    if item.get("id") == upload["mapId"]:
                        item["status"] = "Evidence Submitted"
                        break
                db.setdefault("audit", []).insert(0, {"actor": upload["actor"], "action": "Evidence file uploaded", "detail": f"{upload['fileName']} uploaded for {upload['mapId']}."})
                save_db(db)
                json_response(self, 200, {"upload": upload, "maps": db.get("maps", [])})
                return
            if path == "/api/firebase-sync":
                json_response(self, 200, sync_backend_to_firebase())
                return
            if path == "/api/train":
                TRAINED_MODEL = train_model(payload.get("csv", ""))
                json_response(self, 200, {"model": {**TRAINED_MODEL, "vocabulary": TRAINED_MODEL["vocabulary"][:50]}})
                return
            if path == "/api/classify":
                json_response(self, 200, classify_department(payload.get("text", "")))
                return
            if path == "/api/validate-evidence":
                result = validate_evidence(payload.get("map", {}), payload.get("evidenceText", ""))
                db = load_db()
                db.setdefault("evidence", []).insert(0, result)
                db.setdefault("audit", []).insert(0, {"actor": "Evidence Validation Agent", "action": f"Evidence marked {result['verdict']}", "detail": f"{result['mapId']} coverage {result['coverage']}%."})
                save_db(db)
                json_response(self, 200, result)
                return
            if path == "/api/ollama":
                json_response(self, 200, proxy_ollama(payload))
                return
            json_response(self, 404, {"error": "Unknown API route"})
        except Exception as exc:
            json_response(self, 500, {"error": str(exc)})


def proxy_ollama(payload):
    body = json.dumps(
        {
            "model": payload.get("model", "llama3.2"),
            "stream": False,
            "prompt": payload.get("prompt", ""),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "http://localhost:11434/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return {"error": f"Ollama is not reachable: {exc}"}


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("RegIntel backend running at http://127.0.0.1:8000/index.html")
    print("API health check: http://127.0.0.1:8000/api/health")
    server.serve_forever()


if __name__ == "__main__":
    main()
