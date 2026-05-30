import json
import random
from pathlib import Path


random.seed(42)

OUTPUT = Path("compliance_train.jsonl")
TARGET_EXAMPLES = 90000

departments = {
    "IT": {
        "topics": [
            "cyber incident reporting",
            "vulnerability assessment",
            "third-party technology monitoring",
            "access control review",
            "backup restoration testing",
            "digital banking uptime monitoring",
        ],
        "evidence": ["scan report", "incident ticket", "system logs", "RCA document", "access review sheet"],
    },
    "Audit": {
        "topics": [
            "control testing evidence retention",
            "internal audit closure verification",
            "audit observation remediation",
            "sample testing documentation",
            "regulatory evidence archive",
        ],
        "evidence": ["audit checklist", "closure note", "sample test sheet", "evidence archive", "auditor sign-off"],
    },
    "Operations": {
        "topics": [
            "customer communication during outage",
            "branch SOP update",
            "call center escalation script",
            "service disruption handling",
            "customer complaint response",
        ],
        "evidence": ["SOP version", "customer notice", "call script", "service desk report", "approval email"],
    },
    "Legal": {
        "topics": [
            "board-approved policy review",
            "vendor contract clause update",
            "investor disclosure template review",
            "governance policy amendment",
            "outsourcing agreement review",
        ],
        "evidence": ["legal approval note", "revised contract", "policy version", "board minutes", "clause tracker"],
    },
    "Risk": {
        "topics": [
            "operational risk impact assessment",
            "enterprise risk committee escalation",
            "high-risk compliance gap review",
            "financial impact assessment",
            "resilience risk scoring",
        ],
        "evidence": ["risk assessment", "committee note", "risk register", "impact analysis", "mitigation plan"],
    },
    "Compliance": {
        "topics": [
            "RBI circular implementation tracking",
            "regulatory return filing",
            "SEBI notification applicability mapping",
            "compliance deadline monitoring",
            "regulator submission proof",
        ],
        "evidence": ["compliance tracker", "submission receipt", "applicability matrix", "deadline report", "owner mapping"],
    },
}

regulators = ["RBI", "SEBI", "Internal Governance", "Audit Committee", "Board Risk Committee"]
deadlines = ["within 6 hours", "within 24 hours", "within 7 days", "within 15 days", "within 30 days", "by 30 June 2026"]
priorities = {"High": range(78, 96), "Medium": range(55, 77), "Low": range(35, 54)}
bank_units = [
    "Retail Banking",
    "Digital Banking",
    "Treasury",
    "Credit Operations",
    "Branch Operations",
    "Information Security",
    "Vendor Management",
    "Customer Support",
    "Corporate Banking",
    "Cards",
    "Payments",
    "AML Operations",
    "Data Governance",
    "Business Continuity",
    "Information Technology",
]
regulation_types = [
    "RBI circular",
    "SEBI notification",
    "internal governance note",
    "audit guideline",
    "policy amendment",
    "board directive",
]
controls = [
    "maker-checker approval",
    "daily monitoring",
    "monthly reporting",
    "exception escalation",
    "evidence retention",
    "senior management sign-off",
    "root cause analysis",
    "customer notification",
    "vendor attestation",
    "access certification",
    "control self-assessment",
    "board reporting",
    "regulatory attestation",
    "automated alert review",
    "SOP version control",
    "sample-based verification",
    "customer grievance tracking",
]
failure_modes = [
    "missing approval record",
    "late submission",
    "incomplete evidence",
    "wrong department owner",
    "no timestamp",
    "no closure note",
    "policy version mismatch",
    "unverified screenshot",
    "missing maker-checker approval",
    "no RBI acknowledgment",
    "unmapped regulation section",
    "expired policy reference",
    "partial department response",
]
severity_drivers = [
    "customer harm",
    "regulatory penalty",
    "operational disruption",
    "financial exposure",
    "reputational impact",
    "audit qualification",
    "technology outage",
    "vendor concentration risk",
]


def risk_for(priority):
    return random.choice(list(priorities[priority]))


def priority_for(deadline, topic):
    if "6 hours" in deadline or "incident" in topic or "high-risk" in topic:
        return "High"
    if "30 days" in deadline or "policy" in topic or "evidence" in topic:
        return "Medium"
    return random.choice(["Medium", "Low"])


def regulation_sentence(dept, topic, deadline):
    unit = random.choice(bank_units)
    source = random.choice(regulation_types)
    control = random.choice(controls)
    starts = [
        f"Under the {source}, banks must complete {topic} for {unit}",
        f"Responsible teams must document {topic} for {unit}",
        f"The bank must implement {topic} with {control}",
        f"{dept} teams must evidence {topic} across {unit}",
        f"Control owners must review {topic} and maintain {control}",
        f"The {unit} function must update procedures for {topic}",
        f"Banks must monitor {topic} using {control}",
    ]
    tails = [
        f"{deadline}.",
        f"{deadline} and maintain approval records.",
        f"{deadline} with owner mapping and closure evidence.",
        f"{deadline} and escalate overdue items to senior management.",
        f"{deadline} with documented exception handling.",
        f"{deadline} and preserve evidence for audit inspection.",
    ]
    return f"{random.choice(starts)} {random.choice(tails)}"


def multi_clause_document(dept, topic, deadline):
    related = random.sample(departments[dept]["topics"], k=min(3, len(departments[dept]["topics"])))
    lines = [f"{random.choice(regulators)} Compliance Update"]
    for index, item in enumerate(related, start=1):
        lines.append(f"Section {index}: {regulation_sentence(dept, item, deadline)}")
    lines.append(f"Section {len(related) + 1}: Evidence must include {', '.join(random.sample(departments[dept]['evidence'], k=2))}.")
    return "\n".join(lines)


def map_example(dept, topic, deadline):
    priority = priority_for(deadline, topic)
    risk = risk_for(priority)
    evidence = ", ".join(random.sample(departments[dept]["evidence"], k=3))
    regulation = regulation_sentence(dept, topic, deadline)
    response = random.choice(
        [
            f"MAP: Implement and evidence {topic}. Department: {dept}. Priority: {priority}. Risk Score: {risk}. Evidence Required: {evidence}. Deadline: {deadline}.",
            f"Task: Complete {topic} and upload measurable proof. Owner Department: {dept}. Priority: {priority}. Risk Score: {risk}. Required Evidence: {evidence}. Target Date: {deadline}.",
            f"Action Point: Assign {topic} to {dept}, track closure, and retain {evidence}. Priority: {priority}. Compliance Risk: {risk}. Deadline: {deadline}.",
        ]
    )
    return {
        "text": f"### Instruction:\nConvert this regulation into MAPs.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def routing_example(dept, topic, deadline):
    priority = priority_for(deadline, topic)
    risk = risk_for(priority)
    regulation = regulation_sentence(dept, topic, deadline)
    response = random.choice(
        [
            f"Department: {dept}. Priority: {priority}. Risk Score: {risk}. Reason: The obligation relates to {topic} and should be owned by {dept}.",
            f"Route To: {dept}. Confidence: High. Priority: {priority}. Risk Score: {risk}. Explanation: Keywords and business impact indicate {dept} ownership.",
            f"Owning Function: {dept}. Risk Level: {priority}. Score: {risk}. Routing Reason: {topic} falls under {dept} control responsibility.",
        ]
    )
    return {
        "text": f"### Instruction:\nRoute this compliance obligation.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def evidence_example(dept, topic, deadline, should_pass):
    evidence_items = departments[dept]["evidence"]
    regulation = regulation_sentence(dept, topic, deadline)
    if should_pass:
        evidence = f"Uploaded {', '.join(random.sample(evidence_items, k=3))} with owner sign-off, implementation date, and {random.choice(controls)}."
        verdict = "Pass"
        reason = f"Evidence matches {topic}, includes implementation proof, and supports the required deadline."
    else:
        evidence = f"The team discussed the requirement but the submission has {random.choice(failure_modes)} and no complete implementation proof."
        verdict = "Fail"
        reason = f"Evidence does not prove completion of {topic} and lacks measurable implementation artifacts."
    response = f"Verdict: {verdict}. Reason: {reason}"
    return {
        "text": f"### Instruction:\nValidate evidence for this MAP.\n\n### Regulation:\n{regulation}\n\n### Evidence:\n{evidence}\n\n### Response:\n{response}"
    }


def risk_example(dept, topic, deadline):
    priority = priority_for(deadline, topic)
    risk = risk_for(priority)
    regulator = random.choice(regulators)
    regulation = regulation_sentence(dept, topic, deadline)
    response = (
        f"Risk Explanation: This is {priority.lower()} risk with score {risk} because it is linked to "
        f"{regulator}, deadline pressure, operational exposure, and evidence expectations for {topic}."
    )
    return {
        "text": f"### Instruction:\nGenerate risk explanation.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def summary_example(dept, topic, deadline):
    regulation = regulation_sentence(dept, topic, deadline)
    response = (
        f"Summary: The obligation requires {dept} to manage {topic} {deadline}. "
        f"Key controls include {random.choice(controls)}, evidence retention, owner mapping, and overdue escalation."
    )
    return {
        "text": f"### Instruction:\nSummarize this compliance obligation.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def audit_note_example(dept, topic, deadline):
    regulation = regulation_sentence(dept, topic, deadline)
    response = (
        f"Audit Note: Verify whether {dept} completed {topic}, retained evidence, met the deadline {deadline}, "
        f"and documented exceptions. Check sample artifacts and approval trail."
    )
    return {
        "text": f"### Instruction:\nCreate an audit note for this obligation.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def document_map_example(dept, topic, deadline):
    document = multi_clause_document(dept, topic, deadline)
    priority = priority_for(deadline, topic)
    risk = risk_for(priority)
    response = (
        f"Generated MAPs:\n"
        f"1. Implement {topic}. Department: {dept}. Priority: {priority}. Risk Score: {risk}.\n"
        f"2. Upload evidence including {', '.join(random.sample(departments[dept]['evidence'], k=2))}.\n"
        f"3. Track deadline {deadline} and escalate overdue items."
    )
    return {
        "text": f"### Instruction:\nGenerate MAPs from this regulatory document.\n\n### Regulation Document:\n{document}\n\n### Response:\n{response}"
    }


def escalation_example(dept, topic, deadline):
    driver = random.choice(severity_drivers)
    response = (
        f"Escalation: Route to {dept} head and compliance officer. Trigger: {topic} may cause {driver}. "
        f"Required Action: submit mitigation plan, evidence owner, and revised completion date. Deadline: {deadline}."
    )
    regulation = regulation_sentence(dept, topic, deadline)
    return {
        "text": f"### Instruction:\nCreate an escalation note.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def reminder_example(dept, topic, deadline):
    response = (
        f"Reminder: {dept} must complete {topic} {deadline}. Upload evidence, owner sign-off, and exception notes before closure."
    )
    regulation = regulation_sentence(dept, topic, deadline)
    return {
        "text": f"### Instruction:\nWrite a compliance reminder.\n\n### Regulation:\n{regulation}\n\n### Response:\n{response}"
    }


def main():
    examples = []
    for dept, data in departments.items():
        for topic in data["topics"]:
            for deadline in deadlines:
                examples.append(map_example(dept, topic, deadline))
                examples.append(routing_example(dept, topic, deadline))
                examples.append(risk_example(dept, topic, deadline))
                examples.append(evidence_example(dept, topic, deadline, True))
                examples.append(evidence_example(dept, topic, deadline, False))
                examples.append(summary_example(dept, topic, deadline))
                examples.append(audit_note_example(dept, topic, deadline))
                examples.append(document_map_example(dept, topic, deadline))
                examples.append(escalation_example(dept, topic, deadline))
                examples.append(reminder_example(dept, topic, deadline))

    while len(examples) < TARGET_EXAMPLES:
        dept = random.choice(list(departments))
        topic = random.choice(departments[dept]["topics"])
        deadline = random.choice(deadlines)
        maker = random.choice([
            map_example,
            routing_example,
            risk_example,
            summary_example,
            audit_note_example,
            document_map_example,
            escalation_example,
            reminder_example,
            lambda d, t, dl: evidence_example(d, t, dl, True),
            lambda d, t, dl: evidence_example(d, t, dl, False),
        ])
        examples.append(maker(dept, topic, deadline))

    random.shuffle(examples)
    with OUTPUT.open("w", encoding="utf-8") as file:
        for row in examples[:TARGET_EXAMPLES]:
            file.write(json.dumps(row, ensure_ascii=True) + "\n")

    print(f"Wrote {min(len(examples), TARGET_EXAMPLES)} examples to {OUTPUT}")


if __name__ == "__main__":
    main()
