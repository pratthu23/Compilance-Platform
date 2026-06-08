const samplePrevious = `RBI/2025-26/44 Cyber Resilience Circular
Section 1: Banks must maintain a board-approved cyber security policy and review it annually.
Section 2: Material cyber incidents must be reported to the Reserve Bank within 24 hours.
Section 3: Banks must conduct quarterly vulnerability assessments for internet-facing systems.
Section 4: Customer impact communication should be initiated when service disruption exceeds 12 hours.`;

const sampleCurrent = `RBI/2026-27/18 Digital Banking Resilience Circular
Section 1: Banks must maintain a board-approved cyber security policy and review it every six months.
Section 2: Material cyber incidents must be reported to the Reserve Bank within 6 hours, with root cause analysis submitted within 72 hours.
Section 3: Banks must conduct monthly vulnerability assessments for internet-facing systems and critical third-party integrations.
Section 4: Customer impact communication must be initiated when service disruption exceeds 6 hours.
Section 5: Banks must appoint a senior accountable officer for digital operational resilience by 30 June 2026.
Section 6: Evidence of control testing must be preserved for audit review for at least eight years.`;

const API_BASE = "https://compilance-platform.onrender.com";
const departments = ["Compliance", "Legal", "Risk", "Operations", "Audit", "IT"];

const defaultTrainingData = `clause,department
"Material cyber incidents must be reported to the Reserve Bank within 6 hours",IT
"Banks must conduct monthly vulnerability assessments for internet-facing systems",IT
"Critical third-party technology integrations require continuous monitoring",IT
"Banks must retain control testing evidence for audit review",Audit
"Evidence of implementation must be preserved for eight years",Audit
"Internal audit must verify closure of regulatory observations",Audit
"Customer communication must begin when digital services are disrupted",Operations
"Branch teams must update operational SOPs for customer notification",Operations
"Service outage handling must include escalation and customer support",Operations
"Board-approved policy must be reviewed every six months",Legal
"Governance policy amendments require legal review",Legal
"Contractual clauses for outsourced vendors must be updated",Legal
"Operational resilience risk exposure must be reported to senior management",Risk
"Banks must assess financial and operational impact of regulatory failures",Risk
"High-risk compliance gaps must be escalated to enterprise risk committee",Risk
"Regulatory returns must be filed with the Reserve Bank before deadline",Compliance
"Compliance officer must track RBI circular implementation status",Compliance
"SEBI and RBI notifications must be mapped to applicable obligations",Compliance`;

const state = {
  clauses: [],
  maps: [],
  audit: [],
  evidence: [],
  filter: "all",
  trainedModel: null,
  useTrainedModel: false,
  currentUser: null,
  uploads: [],
  sources: [],
  reminders: []
};

function getFirebaseBackend() {
  return window.firebaseBackend || { enabled: false, status: "Firebase not configured" };
}

async function saveToFirebase(kind, payload) {
  const firebase = getFirebaseBackend();
  if (!firebase.enabled) return null;
  try {
    if (kind === "audit") return await firebase.saveAuditEvent(payload);
    if (kind === "analysis") return await firebase.saveAnalysis(payload);
    if (kind === "evidence") return await firebase.saveEvidenceReview(payload);
    if (kind === "training") return await firebase.saveTrainingRun(payload);
    if (kind === "snapshot") return await firebase.syncSnapshot(payload);
    if (kind === "sms") return await firebase.saveSmsNotification(payload);
  } catch (error) {
    showToast(`Firebase save failed: ${error.message}`);
  }
  return null;
}

function friendlyAuthError(error) {
  const message = error.message || String(error);
  if (message.includes("auth/too-many-requests")) {
    return "Firebase temporarily blocked attempts because there were too many tries. Wait a few minutes, then try again, or use a demo account.";
  }
  if (message.includes("auth/email-already-in-use")) {
    return "This email is already registered. Use Sign in instead.";
  }
  if (message.includes("auth/weak-password")) {
    return "Password is too weak. Use at least 6 characters.";
  }
  if (message.includes("auth/invalid-email")) {
    return "Enter a valid email address.";
  }
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
    return "Incorrect email or password.";
  }
  return message;
}

function showSuccessModal(message) {
  document.getElementById("successMessage").textContent = message;
  document.getElementById("successModal").classList.add("show");
}

const keywordDepartments = [
  { dept: "IT", words: ["cyber", "system", "vulnerability", "digital", "third-party", "incident"] },
  { dept: "Risk", words: ["risk", "resilience", "impact", "critical", "exposure"] },
  { dept: "Operations", words: ["customer", "service", "disruption", "communication"] },
  { dept: "Audit", words: ["audit", "evidence", "preserved", "testing"] },
  { dept: "Legal", words: ["policy", "board", "approved", "governance"] },
  { dept: "Compliance", words: ["rbi", "reserve bank", "reported", "regulation"] }
];

const regulatoryKeywords = [
  "rbi", "reserve bank", "sebi", "circular", "notification", "regulation", "regulatory",
  "compliance", "audit", "policy", "guideline", "obligation", "deadline", "risk",
  "bank", "banks", "financial institution", "control", "evidence", "governance",
  "section", "shall", "must", "reporting", "submission", "supervisory", "inspection"
];

const bankingDomainKeywords = [
  "rbi", "reserve bank", "sebi", "bank", "banks", "banking", "financial institution",
  "nbfc", "payment system", "credit", "deposit", "branch", "customer account",
  "kyc", "aml", "basel", "capital adequacy", "liquidity", "lending", "loan"
];

const nonRegulatoryKeywords = [
  "resume", "curriculum vitae", "education", "skills", "experience", "projects",
  "objective", "linkedin", "github", "internship", "cgpa", "certification",
  "hobbies", "profile summary", "employment history"
];

const documentClassifier = [
  {
    label: "banking_regulatory",
    weight: 1.25,
    terms: [
      "rbi", "reserve bank", "sebi", "bank", "banks", "banking", "nbfc", "financial institution",
      "payment system", "kyc", "aml", "circular", "notification", "supervisory", "regulatory return",
      "customer account", "digital banking", "operational resilience"
    ]
  },
  {
    label: "regulatory_obligation",
    weight: 1,
    terms: [
      "section", "clause", "para", "must", "shall", "compliance", "obligation", "statutory",
      "audit", "evidence", "records", "retained", "retention", "deadline", "within", "approval",
      "documentation", "policy", "control", "review", "reported", "submitted", "implementation"
    ]
  },
  {
    label: "non_regulatory",
    weight: 1.5,
    terms: [
      "resume", "curriculum vitae", "education", "skills", "portfolio", "github", "linkedin",
      "objective", "hobbies", "internship", "cgpa", "personal profile", "career summary"
    ]
  }
];

function classifyDocumentLocally(text) {
  const lower = text.toLowerCase();
  const scores = documentClassifier.map((bucket) => ({
    label: bucket.label,
    score: bucket.terms.reduce((total, term) => total + (lower.includes(term) ? bucket.weight : 0), 0)
  }));
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0] || { label: "unknown", score: 0 };
  const total = scores.reduce((sum, item) => sum + item.score, 0) || 1;
  return {
    label: top.label,
    confidence: Math.round((top.score / total) * 100),
    scores
  };
}

function nowStamp() {
  return new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function logAudit(actor, action, detail) {
  const event = { actor, action, detail, time: nowStamp() };
  state.audit.unshift(event);
  renderAudit();
  saveToFirebase("audit", event);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

function actorName() {
  return state.currentUser ? state.currentUser.name : "Demo User";
}

function visibleMaps() {
  if (!state.currentUser || ["Admin", "Compliance Officer", "Auditor"].includes(state.currentUser.role)) {
    return state.maps;
  }
  return state.maps.filter((map) => map.department === state.currentUser.department);
}

function allowedViewsForRole(role) {
  const common = ["dashboard", "department", "maps", "evidence", "audit"];
  if (role === "Admin") return ["dashboard", "ingestion", "department", "maps", "evidence", "ai-lab", "audit", "architecture"];
  if (role === "Compliance Officer") return ["dashboard", "ingestion", "department", "maps", "evidence", "audit", "architecture"];
  if (role === "Auditor") return ["dashboard", "department", "maps", "evidence", "audit"];
  if (role === "Department User") return common;
  return [];
}

function applyRoleAccess() {
  const role = state.currentUser ? state.currentUser.role : null;
  const allowed = new Set(allowedViewsForRole(role));
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("role-hidden", !allowed.has(link.dataset.view));
  });
  if (state.currentUser && !allowed.has(document.querySelector(".view.active")?.id)) {
    showView(allowed.values().next().value || "dashboard");
  }
}

function parseClauses(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const clauses = [];
  let current = null;

  lines.forEach((line) => {
    const match = line.match(/^(Section\s+\d+|Clause\s+\d+|Para\s+\d+)\s*:?\s*(.*)$/i);
    if (match) {
      if (current) clauses.push(current);
      current = {
        section: match[1].replace(/\s+/g, " "),
        textParts: match[2] ? [match[2]] : []
      };
      return;
    }
    if (current) {
      current.textParts.push(line);
    }
  });
  if (current) clauses.push(current);

  return clauses.map((clause, index) => {
    const clauseText = clause.textParts.join(" ").replace(/\s+/g, " ").trim();
    return {
      id: `CL-${String(index + 1).padStart(3, "0")}`,
      section: clause.section,
      text: clauseText,
      keywords: extractKeywords(clauseText || clause.section)
    };
  });
}

function assessDocument(text) {
  const lower = text.toLowerCase();
  if (lower.includes("text extraction is not available for this file")) {
    return {
      isRegulatory: false,
      regulatoryScore: 0,
      nonRegulatoryScore: 0,
      regulatorySignals: [],
      nonRegulatorySignals: [],
      message: "This file was uploaded, but the prototype could not extract readable text from it. Upload a .txt regulatory document or paste the circular text before analysis."
    };
  }
  const regulatorySignals = regulatoryKeywords.filter((word) => lower.includes(word));
  const bankingSignals = bankingDomainKeywords.filter((word) => lower.includes(word));
  const nonRegulatorySignals = nonRegulatoryKeywords.filter((word) => lower.includes(word));
  const sectionCount = (lower.match(/section\s+\d+|clause\s+\d+|para\s+\d+/g) || []).length;
  const obligationSignals = ["must", "shall", "obligation", "compliance", "within", "deadline", "reported", "submitted", "retained", "review", "evidence", "records"].filter((word) => lower.includes(word));
  const ml = classifyDocumentLocally(text);
  const regulatoryScore = new Set(regulatorySignals).size + Math.min(sectionCount, 5);
  const bankingScore = new Set(bankingSignals).size;
  const nonRegulatoryScore = new Set(nonRegulatorySignals).size;
  let isRegulatory =
    nonRegulatoryScore === 0 &&
    (
      (bankingScore >= 1 && regulatoryScore >= 3) ||
      (ml.label === "banking_regulatory" && regulatoryScore >= 3) ||
      (ml.label === "regulatory_obligation" && sectionCount >= 1 && obligationSignals.length >= 2 && regulatoryScore >= 4) ||
      (sectionCount >= 2 && obligationSignals.length >= 3 && regulatoryScore >= 5)
    );
  if (lower.includes("resume") || lower.includes("curriculum vitae")) isRegulatory = false;
  return {
    isRegulatory,
    regulatoryScore,
    bankingScore,
    obligationScore: obligationSignals.length,
    mlLabel: ml.label,
    mlConfidence: ml.confidence,
    nonRegulatoryScore,
    regulatorySignals: [...new Set([...regulatorySignals, ...bankingSignals, ...obligationSignals])].slice(0, 12),
    nonRegulatorySignals: [...new Set(nonRegulatorySignals)].slice(0, 12),
    message: isRegulatory
      ? (bankingScore >= 1 ? "Banking/regulatory document detected." : "Regulatory obligation document detected by the local ML classifier.")
      : "This does not look like a regulatory obligation document, so MAP generation was blocked. Paste an RBI/SEBI circular or section-wise obligation text."
  };
}

function extractKeywords(text) {
  const stopWords = new Set([
    "section", "clause", "para", "must", "shall", "should", "within", "with",
    "from", "that", "this", "these", "those", "their", "there", "where",
    "have", "been", "being", "will", "and", "for", "the", "are", "into"
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 8);
}

function routeDepartment(text) {
  if (state.useTrainedModel && state.trainedModel) {
    return classifyDepartment(text).department;
  }
  const lower = text.toLowerCase();
  const ranked = keywordDepartments
    .map((entry) => ({
      dept: entry.dept,
      score: entry.words.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].score ? ranked[0].dept : "Compliance";
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

function parseTrainingCsv(csv) {
  return csv
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line, index) => line && index > 0)
    .map((line) => {
      const parts = line.match(/^"?(.+?)"?,(Compliance|Legal|Risk|Operations|Audit|IT)$/i);
      if (!parts) return null;
      return { clause: parts[1], department: normalizeDepartment(parts[2]) };
    })
    .filter(Boolean);
}

function normalizeDepartment(value) {
  const found = departments.find((dept) => dept.toLowerCase() === value.toLowerCase());
  return found || "Compliance";
}

function trainRoutingModel(csv) {
  const rows = parseTrainingCsv(csv);
  const model = {
    docs: {},
    words: {},
    totals: {},
    vocabulary: new Set(),
    rowCount: rows.length
  };
  departments.forEach((department) => {
    model.docs[department] = 0;
    model.words[department] = {};
    model.totals[department] = 0;
  });
  rows.forEach((row) => {
    model.docs[row.department] += 1;
    tokenize(row.clause).forEach((word) => {
      model.vocabulary.add(word);
      model.words[row.department][word] = (model.words[row.department][word] || 0) + 1;
      model.totals[row.department] += 1;
    });
  });
  model.vocabulary = [...model.vocabulary];
  state.trainedModel = model;
  logAudit("Department Routing Agent", "Routing model trained", `${rows.length} labeled examples trained in browser with ${model.vocabulary.length} vocabulary terms.`);
  return model;
}

function classifyDepartment(text) {
  const model = state.trainedModel;
  if (!model) return { department: routeDepartment(text), confidence: 0 };
  const words = tokenize(text);
  const vocabSize = Math.max(model.vocabulary.length, 1);
  const totalDocs = Math.max(model.rowCount, 1);
  const scores = departments.map((department) => {
    const prior = Math.log((model.docs[department] + 1) / (totalDocs + departments.length));
    const likelihood = words.reduce((sum, word) => {
      const count = model.words[department][word] || 0;
      return sum + Math.log((count + 1) / (model.totals[department] + vocabSize));
    }, 0);
    return { department, score: prior + likelihood };
  });
  scores.sort((a, b) => b.score - a.score);
  const confidence = Math.round(Math.min(98, Math.max(45, (scores[0].score - scores[1].score + 4) * 18)));
  return { department: scores[0].department, confidence, scores };
}

function calculateRisk(text) {
  const lower = text.toLowerCase();
  let score = 35;
  if (lower.includes("within 6 hours")) score += 30;
  if (lower.includes("30 june 2026")) score += 18;
  if (lower.includes("must")) score += 10;
  if (lower.includes("critical") || lower.includes("material")) score += 15;
  if (lower.includes("audit") || lower.includes("reserve bank")) score += 12;
  if (lower.includes("customer")) score += 8;
  return Math.min(score, 99);
}

function priorityFromRisk(score) {
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function deadlineForClause(text, index) {
  const match = text.match(/\b(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})\b/);
  if (match) return match[1];
  const days = [7, 14, 21, 30, 45, 60][index % 6];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function generateMaps(clauses) {
  return clauses.map((clause, index) => {
    const risk = calculateRisk(clause.text);
    const department = routeDepartment(clause.text);
    return {
      id: `MAP-${String(index + 1).padStart(3, "0")}`,
      task: actionText(clause.text),
      section: clause.section,
      source: clause.text,
      department,
      deadline: deadlineForClause(clause.text, index),
      priority: priorityFromRisk(risk),
      risk,
      status: index % 3 === 0 ? "In Progress" : "Open",
      reason: routingReason(department, clause.text)
    };
  });
}

function actionText(text) {
  const clean = text.replace(/\.$/, "");
  if (/must/i.test(clean)) return clean.replace(/Banks must/i, "Implement and evidence");
  if (/should/i.test(clean)) return clean.replace(/Banks should/i, "Review and document");
  return `Assess and document compliance for: ${clean}`;
}

function routingReason(department, text) {
  if (state.useTrainedModel && state.trainedModel) {
    const result = classifyDepartment(text);
    return `Trained local classifier predicted ${result.department} with ${result.confidence}% confidence.`;
  }
  const lower = text.toLowerCase();
  if (department === "IT") return "Detected cyber, systems, incident, or integration language.";
  if (department === "Risk") return "Detected resilience, exposure, criticality, or impact language.";
  if (department === "Operations") return "Detected customer communication or service continuity language.";
  if (department === "Audit") return "Detected evidence retention, control testing, or audit language.";
  if (department === "Legal") return "Detected policy, board approval, or governance language.";
  if (lower.includes("reserve bank")) return "Detected regulatory reporting obligation.";
  return "Default compliance ownership for regulatory obligation.";
}

async function askLocalLlm() {
  const result = document.getElementById("llmResult");
  const model = document.getElementById("ollamaModel").value.trim() || "llama3.2";
  const prompt = document.getElementById("llmPrompt").value.trim();
  result.innerHTML = `<pre>Contacting local Ollama model "${model}"...</pre>`;
  try {
    const backendResponse = await apiPost("/api/ollama", {
      model,
      prompt: `${prompt}\n\nReturn concise JSON with task, department, priority, deadline, risk_reason.`
    });
    if (backendResponse.error) throw new Error(backendResponse.error);
    result.innerHTML = `<pre>${escapeHtml(backendResponse.response || "No response returned.")}</pre>`;
    logAudit("Backend API", "LLM prompt completed", `Backend proxied Ollama model ${model}.`);
  } catch {
    try {
      const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: `${prompt}\n\nReturn concise JSON with task, department, priority, deadline, risk_reason.`
      })
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json();
    result.innerHTML = `<pre>${escapeHtml(data.response || "No response returned.")}</pre>`;
    logAudit("Local LLM", "LLM prompt completed", `Ollama model ${model} generated compliance output.`);
    } catch (error) {
    result.innerHTML = `<pre>Local LLM is not reachable yet.

Free setup:
1. Install Ollama from https://ollama.com
2. Run: ollama pull ${model}
3. Run: ollama serve
4. Try this button again.

Technical message: ${escapeHtml(error.message)}</pre>`;
    }
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTrainingResult(model) {
  const target = document.getElementById("trainingResult");
  const counts = departments.map((department) => `${department}: ${model.docs[department]}`).join("\n");
  target.innerHTML = `<pre>Model trained successfully.

Examples: ${model.rowCount}
Vocabulary terms: ${model.vocabulary.length}

Department examples:
${counts}

Enable "Use trained routing", then click Run or Analyze Document to route MAPs using this trained classifier.</pre>`;
}

function diffRegulations(previousText, currentText) {
  const oldClauses = parseClauses(previousText);
  const newClauses = parseClauses(currentText);
  return newClauses.map((clause, index) => {
    const old = oldClauses[index];
    if (!old) return { type: "added", section: clause.section, text: clause.text };
    if (old.text !== clause.text) {
      return {
        type: "modified",
        section: clause.section,
        text: clause.text,
        oldText: old.text
      };
    }
    return { type: "unchanged", section: clause.section, text: clause.text };
  });
}

async function analyzeDocument(text) {
  if (!text.trim()) {
    showToast("Paste or upload a document first");
    return;
  }
  let assessment;
  try {
    const useBigModel = document.getElementById("useBigModel")?.checked || false;
    const model = document.getElementById("bigModelName")?.value.trim() || "llama3.2";
    if (useBigModel) showToast(`Analyzing with local ${model}. This can take a minute`);
    const result = await apiPost("/api/analyze", { text, useBigModel, model });
    assessment = result.assessment;
    if (result.blocked) {
      state.clauses = [];
      state.maps = [];
      state.evidence = [];
      renderAll();
      renderDocumentAssessment(assessment);
      logAudit("Regulation Parsing Agent", "Document rejected", assessment.message);
      showToast("Document rejected: not regulatory");
      return;
    }
    state.clauses = result.clauses;
    state.maps = result.maps;
    logAudit("Backend API", "Document analyzed", `${state.clauses.length} clauses extracted by Python backend${result.bigModel ? " with local big model" : ""}.`);
  } catch {
    assessment = assessDocument(text);
    if (!assessment.isRegulatory) {
      state.clauses = [];
      state.maps = [];
      state.evidence = [];
      renderAll();
      renderDocumentAssessment(assessment);
      logAudit("Regulation Parsing Agent", "Document rejected", assessment.message);
      showToast("Document rejected: not regulatory");
      return;
    }
    state.clauses = parseClauses(text);
    if (!state.clauses.length) {
      state.clauses = [{ id: "CL-001", section: "Detected obligation", text: text.slice(0, 800), keywords: extractKeywords(text) }];
    }
    state.maps = generateMaps(state.clauses);
    logAudit("Regulation Parsing Agent", "Document analyzed", `${state.clauses.length} clauses extracted in browser fallback mode.`);
  }
  state.evidence = [];
  renderAll();
  renderDocumentAssessment(assessment);
  addAgentEvents();
  saveToFirebase("analysis", {
    source: "regulatory_document",
    clauseCount: state.clauses.length,
    mapCount: state.maps.length,
    clauses: state.clauses,
    maps: state.maps
  });
  logAudit("MAP Generation Agent", "MAPs generated", `${state.maps.length} measurable action points created and routed.`);
  showToast("Agent workflow completed");
}

function renderDocumentAssessment(assessment) {
  const target = document.getElementById("documentAssessment");
  if (!target) return;
  if (!assessment) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `<div class="assessment-card ${assessment.isRegulatory ? "pass" : "blocked"}">
    <strong>${assessment.isRegulatory ? "Document accepted" : "Document rejected"}</strong>
    <p>${assessment.message}</p>
    <small>Regulatory score: ${assessment.regulatoryScore} | Banking score: ${assessment.bankingScore || 0} | Obligation score: ${assessment.obligationScore || 0} | Non-regulatory score: ${assessment.nonRegulatoryScore}</small>
    <small>Local ML: ${assessment.mlLabel || "rules"}${assessment.mlConfidence ? ` (${assessment.mlConfidence}% confidence)` : ""}</small>
    <small>Signals: ${(assessment.regulatorySignals || []).join(", ") || "none"}</small>
    ${(assessment.nonRegulatorySignals || []).length ? `<small>Non-regulatory signals: ${assessment.nonRegulatorySignals.join(", ")}</small>` : ""}
  </div>`;
}

function addAgentEvents() {
  const feed = document.getElementById("agentFeed");
  const events = [
    ["Parsing", `${state.clauses.length} clauses and metadata fields extracted.`],
    ["Change Detection", "Semantic diff compared current and historical regulation."],
    ["MAP Generation", `${state.maps.length} action points created with source traceability.`],
    ["Department Routing", "Tasks assigned across Compliance, Legal, Risk, Operations, Audit, and IT."],
    ["Risk Intelligence", "Severity scores calculated from deadline, impact, and regulatory criticality."]
  ];
  feed.innerHTML = events
    .map(([title, detail]) => `<li><strong>${title}</strong><small>${detail}</small></li>`)
    .join("");
}

function renderAll() {
  renderMetrics();
  renderHeatmap();
  renderClauses();
  renderDiff();
  renderMaps();
  renderMapSelect();
  renderDepartmentDashboard();
  renderSourceFeed();
  renderReminders();
  if (!state.clauses.length && !state.maps.length) renderDocumentAssessment(null);
  renderAudit();
}

function renderMetrics() {
  const overdue = state.maps.filter((map) => map.priority === "High" && map.status !== "Complete").length;
  const risk = state.maps.length
    ? Math.round(state.maps.reduce((sum, map) => sum + map.risk, 0) / state.maps.length)
    : 0;
  const passRate = state.evidence.length
    ? Math.round((state.evidence.filter((item) => item.verdict === "Pass").length / state.evidence.length) * 100)
    : 0;
  document.getElementById("metricOpen").textContent = state.maps.filter((map) => map.status !== "Complete").length;
  document.getElementById("metricOverdue").textContent = overdue;
  document.getElementById("metricRisk").textContent = risk;
  document.getElementById("metricPass").textContent = `${passRate}%`;
}

function riskColor(score) {
  if (score >= 75) return "#b42318";
  if (score >= 55) return "#ad5d00";
  return "#2f7d32";
}

function renderHeatmap() {
  const heatmap = document.getElementById("heatmap");
  const tiles = departments.map((department) => {
    const items = state.maps.filter((map) => map.department === department);
    const avg = items.length ? Math.round(items.reduce((sum, item) => sum + item.risk, 0) / items.length) : 0;
    return { department, count: items.length, avg };
  });
  heatmap.innerHTML = tiles
    .filter((tile) => document.getElementById("heatmapFilter").value !== "high" || tile.avg >= 75)
    .map(
      (tile) => `<article class="heat-tile" style="--risk-height:${tile.avg}%;--risk-color:${riskColor(tile.avg)}">
        <strong>${tile.department}</strong>
        <span>${tile.count} MAPs</span>
        <span>Risk score ${tile.avg}</span>
      </article>`
    )
    .join("");
}

function renderClauses() {
  const target = document.getElementById("parsedClauses");
  target.innerHTML = state.clauses.length
    ? state.clauses
        .map(
          (clause) => `<article class="clause">
            <strong>${clause.id} ${clause.section}</strong>
            <p>${clause.text}</p>
            <small>Keywords: ${clause.keywords.join(", ") || "none"}</small>
          </article>`
        )
        .join("")
    : `<p class="muted">Analyze a regulation to view extracted clauses.</p>`;
}

function renderDiff() {
  const target = document.getElementById("diffView");
  const currentText = document.getElementById("documentText").value.trim();
  if (!currentText) {
    target.innerHTML = `<p class="muted">Analyze or paste a regulation to compare it with the historical version.</p>`;
    return;
  }
  const diff = diffRegulations(samplePrevious, currentText);
  const changedItems = diff.filter((item) => item.type !== "unchanged");
  if (!diff.length) {
    target.innerHTML = `<p class="muted">No sections were detected for visualization. Use headings like "Section 1:" followed by the obligation text.</p>`;
    return;
  }
  if (!changedItems.length) {
    target.innerHTML = `<p class="muted">No changes detected against the historical sample.</p>`;
    return;
  }
  target.innerHTML = changedItems
    .map(
      (item) => `<div class="diff-line ${item.type}">
        <span class="pill">${item.type}</span>
        <div>
          <strong>${item.section}</strong>
          ${item.oldText ? `<small><strong>Previous:</strong> ${item.oldText}</small>` : ""}
          <p><strong>Current:</strong> ${item.text || "No obligation text found for this section."}</p>
        </div>
      </div>`
    )
    .join("");
}

function renderMaps() {
  const table = document.getElementById("mapTable");
  const baseMaps = visibleMaps();
  const maps = state.filter === "all" ? baseMaps : baseMaps.filter((map) => map.priority === state.filter);
  table.innerHTML = maps
    .map(
      (map) => `<tr>
        <td><strong>${map.id}</strong><br>${map.task}<br><small>${map.reason}</small></td>
        <td>${map.section}</td>
        <td>${map.department}</td>
        <td>${map.deadline}</td>
        <td><span class="pill ${map.priority}">${map.priority}</span></td>
        <td><div class="risk-bar" style="--risk-color:${riskColor(map.risk)}"><span style="--value:${map.risk}%"></span></div><small>${map.risk}</small></td>
        <td>
          <select class="status-select" data-map-id="${map.id}">
            ${["Open", "In Progress", "Evidence Submitted", "Needs Review", "Complete"].map((status) => `<option value="${status}" ${map.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </td>
      </tr>`
    )
    .join("");
  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", () => updateMapStatus(select.dataset.mapId, select.value));
  });
}

function renderMapSelect() {
  const select = document.getElementById("mapSelect");
  select.innerHTML = visibleMaps()
    .map((map) => `<option value="${map.id}">${map.id} - ${map.department} - ${map.section}</option>`)
    .join("");
}

function renderDepartmentDashboard() {
  const maps = visibleMaps();
  const department = state.currentUser ? state.currentUser.department : "All";
  const role = state.currentUser ? `${state.currentUser.role} | ${state.currentUser.name}` : "Login to filter tasks";
  document.getElementById("deptName").textContent = department;
  document.getElementById("deptRole").textContent = role;
  document.getElementById("deptMapCount").textContent = maps.length;
  document.getElementById("deptHighCount").textContent = maps.filter((map) => map.priority === "High").length;
  document.getElementById("deptCompleteCount").textContent = maps.filter((map) => map.status === "Complete").length;
  const board = document.getElementById("departmentBoard");
  board.innerHTML = maps.length
    ? maps.map((map) => `<article class="task-card">
        <strong>${map.id} | ${map.priority}</strong>
        <small>${map.department} | ${map.status}</small>
        <p>${map.task}</p>
        <small>Deadline: ${map.deadline} | Risk: ${map.risk}</small>
      </article>`).join("")
    : `<p class="muted">No tasks visible for the selected role.</p>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractFileText(file) {
  const dataUrl = await fileToDataUrl(file);
  const result = await apiPost("/api/extract-document", { fileName: file.name, dataUrl });
  return result.text || "";
}

async function fetchSources() {
  const result = await apiGet("/api/sources");
  state.sources = result.sources || [];
  renderSourceFeed();
  logAudit("Source Crawler Agent", "Latest circulars fetched", `${state.sources.length} source records loaded.`);
}

function renderSourceFeed() {
  const target = document.getElementById("sourceFeed");
  if (!target) return;
  target.innerHTML = state.sources.length
    ? state.sources.map((source) => `<article class="task-card">
        <strong>${source.source} | ${source.title}</strong>
        <small>${source.date} | ${source.url}</small>
        <p>${source.summary}</p>
        <button type="button" class="secondary-button import-source-btn" data-source-id="${source.id}">Import sample text</button>
      </article>`).join("")
    : `<p class="muted">Fetch latest circulars to populate this feed.</p>`;
  document.querySelectorAll(".import-source-btn").forEach((button) => {
    button.addEventListener("click", () => importSource(button.dataset.sourceId));
  });
}

async function importSource(sourceId) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  const result = await apiPost("/api/import-source", { source });
  document.getElementById("documentText").value = result.text || source.sampleText || "";
  showView("ingestion");
  logAudit("Regulation Parsing Agent", "Source imported", `${source.title} imported into ingestion workspace.`);
  showToast("Source text imported");
}

async function generateReminders() {
  const result = await apiPost("/api/generate-reminders", { maps: state.maps });
  state.reminders = result.reminders || [];
  renderReminders();
  logAudit("Reminder Agent", "Reminders generated", `${state.reminders.length} reminder messages prepared.`);
}

function renderReminders() {
  const target = document.getElementById("reminderFeed");
  if (!target) return;
  target.innerHTML = state.reminders.length
    ? state.reminders.map((item) => `<article class="task-card">
        <strong>${item.mapId} | ${item.cadence}</strong>
        <small>${item.department}</small>
        <p>${item.message}</p>
      </article>`).join("")
    : `<p class="muted">Generate reminders after MAPs are available.</p>`;
}

async function compareModels() {
  const text = document.getElementById("documentText").value.trim();
  if (!text) {
    showToast("Paste or import a regulation first");
    return;
  }
  const target = document.getElementById("modelCompareResult");
  target.innerHTML = `<pre>Comparing local ML and Ollama outputs...</pre>`;
  const result = await apiPost("/api/model-compare", { text });
  target.innerHTML = `<pre>${escapeHtml(JSON.stringify({
    clauses: result.clauses,
    fastModel: { name: result.fastModel.name, mapCount: result.fastModel.mapCount },
    bigModel: { name: result.bigModel.name, available: result.bigModel.available, mapCount: result.bigModel.mapCount, error: result.bigModel.error }
  }, null, 2))}</pre>`;
  logAudit("Model Governance Agent", "Model comparison completed", `${result.fastModel.mapCount} fast MAPs vs ${result.bigModel.mapCount} big-model MAPs.`);
}

async function explainSelectedMap() {
  const selectedId = document.getElementById("mapSelect").value || state.maps[0]?.id;
  const map = state.maps.find((item) => item.id === selectedId) || state.maps[0];
  if (!map) {
    showToast("Analyze a document first");
    return;
  }
  const result = await apiPost("/api/explain-map", { map });
  document.getElementById("explainResult").innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
  logAudit("Explainability Agent", "MAP explanation generated", `${map.id} routing and risk explanation generated.`);
}

async function decideSelectedMap(decision) {
  const selectedId = document.getElementById("mapSelect").value || state.maps[0]?.id;
  if (!selectedId) {
    showToast("Analyze a document first");
    return;
  }
  const result = await apiPost("/api/approve-map", {
    mapId: selectedId,
    decision,
    actor: actorName(),
    comment: `${decision} from MAP workflow panel`
  });
  if (result.maps) state.maps = result.maps;
  renderAll();
  showToast(`${selectedId} ${decision.toLowerCase()}`);
}

async function validateEvidence() {
  const selectedId = document.getElementById("mapSelect").value;
  const evidenceText = document.getElementById("evidenceText").value;
  const map = state.maps.find((item) => item.id === selectedId);
  if (!map) {
    showToast("Analyze a document before validating evidence");
    return;
  }
  let result;
  try {
    result = await apiPost("/api/validate-evidence", { map, evidenceText });
  } catch {
    const sourceWords = new Set(extractKeywords(map.source));
    const evidenceWords = new Set(extractKeywords(evidenceText));
    const matched = [...sourceWords].filter((word) => evidenceWords.has(word));
    const coverage = Math.round((matched.length / Math.max(sourceWords.size, 1)) * 100);
    const verdict = coverage >= 55 ? "Pass" : coverage >= 25 ? "Needs Review" : "Fail";
    result = {
      mapId: map.id,
      verdict,
      coverage,
      matched,
      reasoning: evidenceReasoning(verdict, map, matched)
    };
  }
  if (window.browserAI?.enhanceEvidence) {
    try {
      showToast("Running browser AI semantic check");
      const statusTarget = document.getElementById("browserAiStatus");
      if (statusTarget) {
        statusTarget.textContent = `Browser AI model: checking semantic match with ${window.browserAI.modelId}`;
      }
      result = await window.browserAI.enhanceEvidence(map, evidenceText, result);
    } catch (error) {
      result.reasoning = `${result.reasoning} Browser AI was unavailable: ${error.message}`;
    }
  }
  const matchedTerms = result.matched || result.matchedTerms || [];
  state.evidence.push(result);
  map.status = result.verdict === "Pass" ? "Complete" : "Needs Evidence";
  saveToFirebase("evidence", { result, map, evidenceText });
  renderEvidenceResult(result);
  renderMetrics();
  renderMaps();
  logAudit("Evidence Validation Agent", `Evidence marked ${result.verdict}`, `${map.id} coverage ${result.coverage}% with matched terms: ${matchedTerms.join(", ") || "none"}.`);
}

async function extractEvidenceText() {
  const file = document.getElementById("evidenceFile").files[0];
  if (!file) {
    showToast("Choose an evidence file first");
    return;
  }
  const text = await extractFileText(file);
  document.getElementById("evidenceText").value = text;
  logAudit("Evidence Validation Agent", "Evidence text extracted", `${file.name} extracted into evidence text box.`);
  showToast("Evidence text extracted");
}

async function updateMapStatus(mapId, status) {
  const map = state.maps.find((item) => item.id === mapId);
  if (!map) return;
  map.status = status;
  try {
    const result = await apiPost("/api/update-map", { mapId, status, actor: actorName() });
    if (result.maps) state.maps = result.maps;
  } catch {
    logAudit(actorName(), "MAP status updated locally", `${mapId} changed to ${status}.`);
  }
  renderAll();
  showToast(`${mapId} updated to ${status}`);
}

async function uploadEvidenceFile() {
  const selectedId = document.getElementById("mapSelect").value;
  const file = document.getElementById("evidenceFile").files[0];
  if (!selectedId || !file) {
    showToast("Select a MAP and evidence file first");
    return;
  }
  const payload = {
    mapId: selectedId,
    fileName: file.name,
    fileType: file.type || "unknown",
    fileSize: file.size,
    note: document.getElementById("evidenceText").value,
    actor: actorName()
  };
  try {
    const result = await apiPost("/api/upload-evidence", payload);
    state.uploads.unshift(result.upload);
    if (result.maps) state.maps = result.maps;
  } catch {
    state.uploads.unshift(payload);
    const map = state.maps.find((item) => item.id === selectedId);
    if (map) map.status = "Evidence Submitted";
  }
  logAudit(actorName(), "Evidence file uploaded", `${file.name} uploaded for ${selectedId}.`);
  renderAll();
  showToast("Evidence file uploaded");
}

function evidenceReasoning(verdict, map, matched) {
  if (verdict === "Pass") {
    return `Evidence sufficiently matches the obligation for ${map.section} and includes relevant controls: ${matched.join(", ")}.`;
  }
  if (verdict === "Needs Review") {
    return `Evidence partially matches ${map.section}, but a compliance officer should confirm missing control details.`;
  }
  return `Evidence does not sufficiently address the source obligation for ${map.section}.`;
}

function renderEvidenceResult(result) {
  const target = document.getElementById("evidenceResult");
  const matchedTerms = result.matched || result.matchedTerms || [];
  target.innerHTML = `<div class="score-ring" style="--score:${result.coverage}%">
      <span>${result.coverage}%</span>
    </div>
    <span class="pill ${result.verdict.split(" ")[0]}">${result.verdict}</span>
    <h2>${result.mapId}</h2>
    <p>${result.reasoning}</p>
    ${Number.isFinite(result.browserSemanticCoverage) ? `<small>Browser AI semantic score: ${result.browserSemanticCoverage}%</small>` : ""}
    ${Number.isFinite(result.semanticCoverage) ? `<small>Backend semantic score: ${result.semanticCoverage}%</small>` : ""}
    <small>Matched terms: ${matchedTerms.join(", ") || "none"}</small>`;
}

function renderAudit() {
  const target = document.getElementById("auditLog");
  target.innerHTML = state.audit.length
    ? state.audit
        .map(
          (event) => `<article class="audit-event">
            <strong>${event.action}</strong>
            <small>${event.time} | ${event.actor}</small>
            <p>${event.detail}</p>
          </article>`
        )
        .join("")
    : `<p class="muted">Audit events will appear as agents and users perform actions.</p>`;
}

function exportAudit() {
  const reportType = document.getElementById("reportType").value;
  const report = {
    generatedAt: new Date().toISOString(),
    platform: "RegIntel AI Compliance Prototype",
    reportType,
    currentUser: state.currentUser,
    maps: state.maps,
    evidence: state.evidence,
    audit: state.audit,
    uploads: state.uploads,
    sources: state.sources,
    reminders: state.reminders
  };
  const pdfText = buildAuditReportText(report, reportType);
  const blob = new Blob([createSimplePdf(pdfText)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `regintel-${reportType}-report.pdf`;
  link.textContent = `Download ${reportType} report PDF`;
  link.className = "download-link";
  const exportResult = document.getElementById("exportResult");
  exportResult.innerHTML = "";
  exportResult.appendChild(link);
  exportResult.insertAdjacentHTML("beforeend", `<pre>${escapeHtml(pdfText)}</pre>`);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  logAudit("Audit Trail Agent", "PDF report exported", `${reportType} PDF package generated for review.`);
  showToast("PDF audit report ready");
}

function buildAuditReportText(report, reportType = "audit") {
  const mapsForReport =
    reportType === "department" ? visibleMaps()
    : reportType === "overdue" ? report.maps.filter((map) => map.priority === "High" && map.status !== "Complete")
    : report.maps;
  const lines = [
    `RegIntel AI Compliance ${reportType.toUpperCase()} Report`,
    `Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}`,
    `Platform: ${report.platform}`,
    `Prepared For: ${report.currentUser ? `${report.currentUser.name} (${report.currentUser.role})` : "Demo User"}`,
    "",
    "Executive Summary",
    `Open MAPs: ${mapsForReport.filter((map) => map.status !== "Complete").length}`,
    `Total MAPs: ${mapsForReport.length}`,
    `Evidence Reviews: ${report.evidence.length}`,
    `Uploaded Evidence Files: ${(report.uploads || []).length}`,
    `Audit Events: ${report.audit.length}`,
    "",
    "Measurable Action Points"
  ];

  if (!mapsForReport.length) {
    lines.push("No MAPs generated yet.");
  }

  mapsForReport.forEach((map) => {
    lines.push(
      "",
      `${map.id} | ${map.department} | ${map.priority} | Risk ${map.risk}`,
      `Section: ${map.section}`,
      `Deadline: ${map.deadline}`,
      `Status: ${map.status}`,
      `Task: ${map.task}`,
      `Reason: ${map.reason}`
    );
  });

  lines.push("", "Evidence Validation");
  if (reportType === "executive") {
    lines.push("", "Department Summary");
    departments.forEach((department) => {
      const deptMaps = report.maps.filter((map) => map.department === department);
      lines.push(`${department}: ${deptMaps.length} MAPs, ${deptMaps.filter((map) => map.status === "Complete").length} complete`);
    });
  }
  if (!report.evidence.length) {
    lines.push("No evidence validations completed yet.");
  }
  report.evidence.forEach((item) => {
    lines.push(
      "",
      `${item.mapId} | ${item.verdict} | Coverage ${item.coverage}%`,
      `Matched terms: ${item.matched.join(", ") || "none"}`,
      `Reasoning: ${item.reasoning}`
    );
  });

  lines.push("", "Uploaded Evidence Files");
  if (!(report.uploads || []).length) {
    lines.push("No evidence files uploaded yet.");
  }
  (report.uploads || []).forEach((upload) => {
    lines.push("", `${upload.mapId} | ${upload.fileName}`, `Type: ${upload.fileType} | Size: ${upload.fileSize} bytes`, `Uploaded By: ${upload.actor}`);
  });

  lines.push("", "Regulation Source Feed");
  if (!(report.sources || []).length) {
    lines.push("No regulation source feed records fetched yet.");
  }
  (report.sources || []).forEach((source) => {
    lines.push("", `${source.source} | ${source.title}`, `Date: ${source.date}`, `URL: ${source.url}`, `Summary: ${source.summary}`);
  });

  lines.push("", "Reminder Plan");
  if (!(report.reminders || []).length) {
    lines.push("No reminders generated yet.");
  }
  (report.reminders || []).forEach((reminder) => {
    lines.push("", `${reminder.mapId} | ${reminder.department} | ${reminder.cadence}`, reminder.message);
  });

  lines.push("", "Audit Trail");
  if (!report.audit.length) {
    lines.push("No audit events recorded yet.");
  }
  report.audit.forEach((event) => {
    lines.push(
      "",
      `${event.time} | ${event.actor}`,
      `${event.action}: ${event.detail}`
    );
  });

  return lines.join("\n");
}

function createSimplePdf(text) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 14;
  const maxChars = 86;
  const lines = wrapPdfLines(text, maxChars);
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pages = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (!pages.length) pages.push(["RegIntel AI Compliance Audit Report"]);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const contentIds = [];

  pages.forEach((pageLines) => {
    const content = [
      "BT",
      "/F1 10 Tf",
      `${margin} ${pageHeight - margin} Td`,
      `14 TL`
    ];
    pageLines.forEach((line, index) => {
      if (index > 0) content.push("T*");
      content.push(`(${escapePdfText(line)}) Tj`);
    });
    content.push("ET");
    const stream = content.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
  });

  const pagesIdPlaceholder = "__PAGES__";
  pages.forEach((_, index) => {
    const pageId = addObject(`<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`);
    pageIds.push(pageId);
  });

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const finalObjects = objects.map((body) => body.replaceAll(`${pagesIdPlaceholder} 0 R`, `${pagesId} 0 R`));
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  finalObjects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${finalObjects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${finalObjects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function wrapPdfLines(text, maxChars) {
  const wrapped = [];
  text.split("\n").forEach((line) => {
    if (!line) {
      wrapped.push("");
      return;
    }
    let remaining = line;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < 20) cut = maxChars;
      wrapped.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trim();
    }
    wrapped.push(remaining);
  });
  return wrapped;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function renderFirebaseStatus() {
  const status = document.getElementById("firebaseStatus");
  if (!status) return;
  const firebase = getFirebaseBackend();
  status.textContent = firebase.status || "Firebase not configured";
  status.classList.toggle("connected", Boolean(firebase.enabled));
}

async function testFirebaseConnection() {
  const result = document.getElementById("firebaseResult");
  const firebase = getFirebaseBackend();
  renderFirebaseStatus();
  if (!firebase.enabled) {
    showFirebaseHelp();
    showToast("Firebase config needed");
    return;
  }
  const id = await saveToFirebase("audit", {
    actor: "Firebase Backend",
    action: "Connection test",
    detail: "Firestore write test from RegIntel AI prototype.",
    time: nowStamp()
  });
  result.innerHTML = `<pre>Firebase write test completed.
Document ID: ${id || "not returned"}
Project status: ${escapeHtml(firebase.status)}</pre>`;
  showToast("Firebase test completed");
}

async function syncFirebaseSnapshot() {
  const result = document.getElementById("firebaseResult");
  const firebase = getFirebaseBackend();
  renderFirebaseStatus();
  if (!firebase.enabled) {
    showFirebaseHelp();
    showToast("Firebase config needed");
    return;
  }
  const id = await saveToFirebase("snapshot", {
    clauses: state.clauses,
    maps: state.maps,
    evidence: state.evidence,
    audit: state.audit,
    metrics: {
      openMaps: state.maps.filter((map) => map.status !== "Complete").length,
      totalMaps: state.maps.length,
      evidenceReviews: state.evidence.length,
      auditEvents: state.audit.length
    }
  });
  result.innerHTML = `<pre>Current project data synced to Firestore.
Snapshot document ID: ${id || "not returned"}</pre>`;
  logAudit("Firebase Backend", "Snapshot synced", "Current MAPs, evidence reviews, and audit events saved to Firestore.");
  showToast("Firebase snapshot synced");
}

async function syncBackendFirebaseSnapshot() {
  const result = document.getElementById("firebaseResult");
  try {
    const response = await apiPost("/api/firebase-sync", {});
    if (response.error) {
      result.innerHTML = `<pre>Backend Firebase sync failed:
${escapeHtml(response.error)}</pre>`;
      showToast("Backend Firebase sync failed");
      return;
    }
    result.innerHTML = `<pre>Backend database synced to Firestore.
Collection: ${response.collection}
Document ID: ${response.id}</pre>`;
    showToast("Backend DB synced");
  } catch (error) {
    result.innerHTML = `<pre>Backend Firebase sync endpoint is not available.

Restart backend:
python backend/server.py

Technical message: ${escapeHtml(error.message)}</pre>`;
  }
}

async function loginDemoUser() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  document.getElementById("loginError").textContent = "";
  if (!username || !password) {
    document.getElementById("loginError").textContent = "Enter email/demo username and password.";
    return;
  }
  const firebase = getFirebaseBackend();
  if (username.includes("@") && firebase.enabled) {
    try {
      state.currentUser = await firebase.signIn(username, password);
      finishLogin();
      return;
    } catch (error) {
      document.getElementById("loginError").textContent = friendlyAuthError(error);
      return;
    }
  }
  try {
    const result = await apiPost("/api/login", { username, password });
    state.currentUser = result.user;
  } catch {
    const fallbackUsers = {
      admin: { password: "admin123", username: "admin", role: "Admin", department: "All", name: "Admin User" },
      compliance: { password: "compliance123", username: "compliance", role: "Compliance Officer", department: "Compliance", name: "Compliance Officer" },
      it: { password: "it123", username: "it", role: "Department User", department: "IT", name: "IT User" },
      legal: { password: "legal123", username: "legal", role: "Department User", department: "Legal", name: "Legal User" },
      risk: { password: "risk123", username: "risk", role: "Department User", department: "Risk", name: "Risk User" },
      operations: { password: "ops123", username: "operations", role: "Department User", department: "Operations", name: "Operations User" },
      audit: { password: "audit123", username: "audit", role: "Auditor", department: "Audit", name: "Auditor" }
    };
    const fallbackUser = fallbackUsers[username];
    if (!fallbackUser || fallbackUser.password !== password) {
      document.getElementById("loginError").textContent = "Invalid username or password.";
      return;
    }
    state.currentUser = { ...fallbackUser };
    delete state.currentUser.password;
  }
  finishLogin();
}

function finishLogin() {
  document.getElementById("currentUserBadge").textContent = `${state.currentUser.name} | ${state.currentUser.role}`;
  document.getElementById("loginScreen").classList.add("hidden");
  document.body.classList.remove("auth-locked");
  applyRoleAccess();
  logAudit(state.currentUser.name, "User login", `${state.currentUser.role} session started.`);
  renderAll();
  showToast(`Logged in as ${state.currentUser.name}`);
}

async function registerFirebaseUser() {
  const firebase = getFirebaseBackend();
  const email = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const name = document.getElementById("registerName").value.trim();
  const countryCode = document.getElementById("registerCountryCode").value;
  const phoneNumber = document.getElementById("registerPhone").value.trim();
  const phone = phoneNumber ? `${countryCode}${phoneNumber.replace(/^\+/, "")}` : "";
  const role = document.getElementById("registerRole").value;
  const department = document.getElementById("registerDepartment").value;
  document.getElementById("loginError").textContent = "";

  if (!firebase.enabled) {
    document.getElementById("loginError").textContent = "Firebase is not configured or not loaded.";
    return;
  }
  if (!email.includes("@") || password.length < 6) {
    document.getElementById("loginError").textContent = "Use an email address and a password of at least 6 characters.";
    return;
  }
  try {
    state.currentUser = await firebase.register({ email, password, name, role, department, phone });
    if (phone) {
      await saveToFirebase("sms", {
        phone,
        email,
        name: name || email,
        status: "queued_demo",
        message: "Registration successful for RegIntel AI Compliance Platform",
        note: "Demo record only. Custom SMS delivery requires Firebase Phone Auth OTP or Cloud Functions with an SMS provider."
      });
    }
    logAudit(state.currentUser.name, "Firebase user registered", `${role} account created for ${department}.`);
    showSuccessModal(
      phone
        ? `Thank you, ${state.currentUser.name}. Your account was created successfully. SMS notification record was saved for ${phone}.`
        : `Thank you, ${state.currentUser.name}. Your account was created successfully.`
    );
    finishLogin();
    showToast("Thank you for registering. Account created successfully.");
  } catch (error) {
    document.getElementById("loginError").textContent = friendlyAuthError(error);
  }
}

function toggleRegisterPanel() {
  const panel = document.getElementById("registerFields");
  panel.classList.toggle("active");
  document.getElementById("showRegisterBtn").textContent = panel.classList.contains("active") ? "Use sign in" : "New user";
  document.getElementById("loginError").textContent = "";
  if (panel.classList.contains("active")) {
    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginUsername").placeholder = "newuser@example.com";
  } else {
    document.getElementById("loginUsername").placeholder = "admin or user@email.com";
  }
}

function logoutUser() {
  const name = state.currentUser ? state.currentUser.name : "User";
  state.currentUser = null;
  getFirebaseBackend().signOut?.();
  document.getElementById("currentUserBadge").textContent = "Not logged in";
  document.getElementById("loginScreen").classList.remove("hidden");
  document.body.classList.add("auth-locked");
  logAudit(name, "User logout", "Session ended.");
  applyRoleAccess();
  showToast("Logged out");
}

async function refreshBackendState() {
  try {
    const result = await apiGet("/api/state");
    state.maps = result.maps || state.maps;
    state.evidence = result.evidence || state.evidence;
    state.audit = result.audit || state.audit;
    state.uploads = result.uploads || state.uploads;
    state.sources = result.sources || state.sources;
    state.reminders = result.reminders || state.reminders;
    renderAll();
    showToast("Backend state refreshed");
  } catch {
    showToast("Backend state unavailable");
  }
}

function showFirebaseHelp() {
  document.getElementById("firebaseResult").innerHTML = `<pre>Firebase setup steps:

1. Go to https://console.firebase.google.com
2. Create a project using the free Spark plan.
3. Open Project Settings > General.
4. Add a Web App.
5. Copy the firebaseConfig object.
6. Paste the values into firebase-config.js.
7. Set useFirebase: true.
8. Go to Build > Firestore Database.
9. Create database in test mode for demo use.
10. Reload this app from http://127.0.0.1:8000/index.html.

Firestore collections created by this app:
regintel_demo_audit_events
regintel_demo_analysis_runs
regintel_demo_evidence_reviews
regintel_demo_training_runs
regintel_demo_snapshots</pre>`;
}

function runDemoWorkflow() {
  document.getElementById("documentText").value = sampleCurrent;
  analyzeDocument(sampleCurrent);
  showView("dashboard");
  showToast("Demo workflow generated");
}

function showView(viewId) {
  if (state.currentUser) {
    const allowed = allowedViewsForRole(state.currentUser.role);
    if (!allowed.includes(viewId)) {
      showToast("This role cannot access that section");
      return;
    }
  }
  document.querySelectorAll(".nav-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((item) => {
    item.classList.toggle("active", item.id === viewId);
  });
}

function wireEvents() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView(link.dataset.view);
    });
  });

  document.getElementById("loadSampleBtn").addEventListener("click", () => {
    document.getElementById("documentText").value = sampleCurrent;
    renderDiff();
    showToast("Sample circular loaded");
  });

  document.getElementById("analyzeBtn").addEventListener("click", () => {
    analyzeDocument(document.getElementById("documentText").value);
  });

  document.getElementById("documentFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      document.getElementById("documentText").value = await file.text();
      renderDocumentAssessment(assessDocument(document.getElementById("documentText").value));
      renderDiff();
    } else {
      try {
        document.getElementById("documentText").value = await extractFileText(file);
        renderDocumentAssessment(assessDocument(document.getElementById("documentText").value));
        renderDiff();
        showToast("Document text extracted");
      } catch (error) {
        document.getElementById("documentText").value = `Uploaded file: ${file.name}

Text extraction failed: ${error.message}
Please paste the actual regulatory text here, or upload a .txt file.`;
        state.clauses = [];
        state.maps = [];
        state.evidence = [];
        renderAll();
        renderDocumentAssessment(assessDocument(document.getElementById("documentText").value));
        showToast("Text extraction failed");
      }
    }
    logAudit("Regulation Parsing Agent", "Document uploaded", `${file.name} received for ingestion.`);
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderMaps();
    });
  });

  document.getElementById("heatmapFilter").addEventListener("change", renderHeatmap);
  document.getElementById("fetchSourcesBtn").addEventListener("click", fetchSources);
  document.getElementById("generateRemindersBtn").addEventListener("click", generateReminders);
  document.getElementById("compareModelsBtn").addEventListener("click", compareModels);
  document.getElementById("explainSelectedMapBtn").addEventListener("click", explainSelectedMap);
  document.getElementById("approveSelectedMapBtn").addEventListener("click", () => decideSelectedMap("Approved"));
  document.getElementById("rejectSelectedMapBtn").addEventListener("click", () => decideSelectedMap("Rejected"));
  document.getElementById("extractEvidenceBtn").addEventListener("click", extractEvidenceText);
  document.getElementById("validateEvidenceBtn").addEventListener("click", validateEvidence);
  document.getElementById("uploadEvidenceBtn").addEventListener("click", uploadEvidenceFile);
  document.getElementById("loginSubmitBtn").addEventListener("click", loginDemoUser);
  document.getElementById("showRegisterBtn").addEventListener("click", toggleRegisterPanel);
  document.getElementById("registerSubmitBtn").addEventListener("click", registerFirebaseUser);
  document.getElementById("successCloseBtn").addEventListener("click", () => {
    document.getElementById("successModal").classList.remove("show");
  });
  document.getElementById("loginPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginDemoUser();
  });
  document.getElementById("logoutBtn").addEventListener("click", logoutUser);
  document.getElementById("refreshStateBtn").addEventListener("click", refreshBackendState);
  document.getElementById("clearAuditBtn").addEventListener("click", () => {
    state.audit = [];
    renderAudit();
    showToast("Demo audit log cleared");
  });
  document.getElementById("trainModelBtn").addEventListener("click", async () => {
    const model = trainRoutingModel(document.getElementById("trainingData").value);
    renderTrainingResult(model);
    saveToFirebase("training", {
      rowCount: model.rowCount,
      vocabularySize: model.vocabulary.length,
      docs: model.docs
    });
    try {
      await apiPost("/api/train", { csv: document.getElementById("trainingData").value });
      document.getElementById("trainingResult").innerHTML += `<pre>Backend model trained successfully.
Future backend analysis calls will use the trained routing model.</pre>`;
    } catch {
      document.getElementById("trainingResult").innerHTML += `<pre>Backend is not running, so the browser model was trained locally.</pre>`;
    }
    showToast("Routing model trained");
  });
  document.getElementById("testClassifierBtn").addEventListener("click", () => {
    if (!state.trainedModel) {
      renderTrainingResult(trainRoutingModel(document.getElementById("trainingData").value));
    }
    const sample = "Banks must preserve control testing evidence for audit review";
    const prediction = classifyDepartment(sample);
    document.getElementById("trainingResult").innerHTML += `<pre>Test clause:
${sample}

Prediction: ${prediction.department}
Confidence: ${prediction.confidence}%</pre>`;
  });
  document.getElementById("useTrainedModel").addEventListener("change", (event) => {
    state.useTrainedModel = event.target.checked;
    if (state.useTrainedModel && !state.trainedModel) {
      renderTrainingResult(trainRoutingModel(document.getElementById("trainingData").value));
    }
    state.maps = generateMaps(state.clauses);
    renderAll();
    logAudit("Department Routing Agent", "Routing mode changed", state.useTrainedModel ? "Using trained browser classifier." : "Using keyword routing rules.");
  });
  document.getElementById("askLocalLlmBtn").addEventListener("click", askLocalLlm);
  document.getElementById("copyOllamaCmdBtn").addEventListener("click", async () => {
    const model = document.getElementById("ollamaModel").value.trim() || "llama3.2";
    const command = `ollama pull ${model}`;
    try {
      await navigator.clipboard.writeText(command);
      showToast("Ollama command copied");
    } catch {
      document.getElementById("llmResult").innerHTML = `<pre>${command}</pre>`;
      showToast("Copy blocked, command shown below");
    }
  });
  document.getElementById("testFirebaseBtn").addEventListener("click", testFirebaseConnection);
  document.getElementById("syncFirebaseBtn").addEventListener("click", syncFirebaseSnapshot);
  document.getElementById("syncBackendFirebaseBtn").addEventListener("click", syncBackendFirebaseSnapshot);
  document.getElementById("showFirebaseHelpBtn").addEventListener("click", showFirebaseHelp);
  window.addEventListener("firebase-backend-ready", renderFirebaseStatus);
  window.addEventListener("browser-ai-status", (event) => {
    const target = document.getElementById("browserAiStatus");
    if (target) {
      target.textContent = `Browser AI model: ${event.detail.message}`;
    }
  });
}

function boot() {
  wireEvents();
  document.body.classList.add("auth-locked");
  document.getElementById("trainingData").value = defaultTrainingData;
  renderAll();
  renderFirebaseStatus();
  if (window.browserAI?.modelId) {
    document.getElementById("browserAiStatus").textContent = `Browser AI model: ready to load ${window.browserAI.modelId} when evidence is validated`;
  }
  applyRoleAccess();
  document.getElementById("agentFeed").innerHTML = `<li><strong>Waiting for document</strong><small>Upload, paste, or load a sample regulation to start the agent workflow.</small></li>`;
}

boot();

window.loginDemoUser = loginDemoUser;
window.registerFirebaseUser = registerFirebaseUser;
window.toggleRegisterPanel = toggleRegisterPanel;
