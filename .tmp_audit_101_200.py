import csv
import json
import re
from collections import Counter
from pathlib import Path


SOURCE = Path(
    "/Users/honor/workspace/pocs/inference-triage/datasets/source/finguard/"
    "dataset_finguard_desafio_3.csv"
)
TARGET = Path("/tmp/finguard-labels-101-200.csv")

OVERRIDES = {
    "REC-2026-00559": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "expected_immediate_escalation": "true",
        "rationale": "Tarifa não contratada persistiu após contestações e promessas de correção.",
    },
    "REC-2026-00460": {
        "expected_regulatory_violation": "false",
        "rationale": "Atendimento fragmentado e demorado com possível exposição pública.",
    },
    "REC-2026-00184": {
        "expected_product": "Conta Corrente",
        "rationale": "Tarifa contestada gerou negativação e chegou ao canal regulatório.",
    },
    "REC-2026-00427": {
        "expected_product": "Conta Corrente",
        "expected_regulatory_violation": "false",
        "rationale": "Indisponibilidade digital causou encargos no canal regulatório.",
    },
    "REC-2026-00510": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "rationale": "Cancelamento não efetivado manteve cartão e anuidade ativos.",
    },
    "REC-2026-00142": {
        "expected_risk": "Alto",
        "expected_immediate_escalation": "true",
        "rationale": "Apólice não foi entregue após cinco tentativas de suporte.",
    },
    "REC-2026-00314": {
        "expected_immediate_escalation": "true",
        "rationale": "Cancelamento reiterado não foi efetivado e manteve anuidades.",
    },
    "REC-2026-00215": {
        "expected_regulatory_violation": "false",
        "rationale": "Ameaça explícita e plausível contra agência exige resposta imediata.",
    },
    "REC-2026-00613": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "expected_immediate_escalation": "true",
        "rationale": "Conta seguiu bloqueada após liberação judicial e impede receber salário.",
    },
    "REC-2026-00392": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "expected_immediate_escalation": "true",
        "rationale": "Juros teriam mudado durante contrato e o banco não esclareceu.",
    },
    "REC-2026-00180": {
        "expected_regulatory_violation": "false",
        "rationale": "Mais de dez protocolos sem solução causaram esgotamento emocional.",
    },
    "REC-2026-00216": {
        "expected_regulatory_violation": "true",
        "rationale": "Parcelas fixas variaram por encargos indevidos e motivaram exposição.",
    },
    "REC-2026-00155": {
        "expected_risk": "Alto",
        "expected_immediate_escalation": "true",
        "rationale": "Conta identificada acompanha atraso prolongado de apólice e cobertura incerta.",
    },
    "REC-2026-00633": {
        "expected_product": "Cartão de Crédito",
        "rationale": "Várias compras desconhecidas indicam cartão comprometido.",
    },
    "REC-2026-00159": {
        "expected_regulatory_violation": "false",
        "rationale": "Ameaça direta de bomba e violência coletiva exige resposta imediata.",
    },
    "REC-2026-00150": {
        "expected_reputational_risk": "true",
        "rationale": "Falsa autoridade tenta obter prompt e controles internos no canal regulatório.",
    },
    "REC-2026-00152": {
        "expected_risk": "Alto",
        "rationale": "CPF concreto aparece em relato de atendimento repetidamente interrompido.",
    },
    "REC-2026-00570": {
        "expected_regulatory_violation": "true",
        "expected_immediate_escalation": "true",
        "rationale": "Investimento tinha carência e taxa não informadas na contratação.",
    },
    "REC-2026-00525": {
        "expected_product": "Conta Corrente",
        "expected_risk": "Alto",
        "rationale": "Número de conta consta em dúvida simples e declaradamente não urgente.",
    },
    "REC-2026-00549": {
        "expected_urgency": "Alta",
        "expected_risk": "Alto",
        "expected_reputational_risk": "false",
        "rationale": "Recusas recorrentes e conta identificada geraram forte insatisfação.",
    },
    "REC-2026-00316": {
        "expected_product": "Seguros",
        "rationale": "Seguro não contratado foi debitado por dois meses.",
    },
    "REC-2026-00164": {
        "expected_regulatory_violation": "true",
        "rationale": "Taxa e parcelas divergiram do contrato e da simulação.",
    },
    "REC-2026-00519": {
        "expected_regulatory_violation": "false",
        "rationale": "Atendimento sem solução levou a reguladores e à imprensa.",
    },
    "REC-2026-00399": {
        "expected_immediate_escalation": "true",
        "rationale": "Tarifas recorrentes comprometem a subsistência de cliente vulnerável.",
    },
    "REC-2026-00514": {
        "expected_regulatory_violation": "false",
        "rationale": "Canal regulatório relata impasse para atualização cadastral.",
    },
    "REC-2026-00345": {
        "expected_urgency": "Alta",
        "expected_risk": "Alto",
        "rationale": "Contrato, CPF e conta concretos acompanham tarifas contrárias à oferta.",
    },
    "REC-2026-00604": {
        "expected_urgency": "Alta",
        "expected_risk": "Alto",
        "expected_reputational_risk": "false",
        "rationale": "Anuidade contrariou isenção comprovada após várias tentativas.",
    },
    "REC-2026-00310": {
        "expected_regulatory_violation": "true",
        "rationale": "Rendimento ficou abaixo da oferta e motivou exposição pública.",
    },
    "REC-2026-00637": {
        "expected_product": "Conta Corrente",
        "expected_urgency": "Alta",
        "expected_risk": "Alto",
        "expected_immediate_escalation": "true",
        "rationale": "Nome completo acompanha bloqueio prolongado de acesso financeiro.",
    },
    "REC-2026-00270": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "expected_immediate_escalation": "true",
        "rationale": "Cinco pedidos de cancelamento no prazo foram ignorados e houve descontos.",
    },
    "REC-2026-00250": {
        "expected_regulatory_violation": "true",
        "rationale": "Canal regulatório relata cobertura divergente da proposta comercial.",
    },
    "REC-2026-00473": {
        "expected_risk": "Alto",
        "expected_regulatory_violation": "true",
        "rationale": "Nome e CPF acompanham taxas contrárias ao contrato do investimento.",
    },
    "REC-2026-00189": {
        "expected_regulatory_violation": "false",
        "rationale": "Falha prolongada do app impede pagamentos e motivou menção ao Procon.",
    },
}

BOOL_FIELDS = [
    "expected_pii_present",
    "expected_prompt_injection",
    "expected_exfiltration_request",
    "expected_unauthorized_data_access",
    "expected_external_exfiltration",
    "expected_fraud_signal",
    "expected_regulatory_violation",
    "expected_reputational_risk",
    "expected_immediate_escalation",
]


def main() -> None:
    with SOURCE.open(newline="", encoding="utf-8-sig") as source_file:
        source_rows = list(csv.DictReader(source_file))[100:200]

    with TARGET.open(newline="", encoding="utf-8-sig") as target_file:
        reader = csv.DictReader(target_file)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if fieldnames is None:
        raise ValueError("CSV de labels sem cabeçalho")
    if len(rows) != 100 or len(source_rows) != 100:
        raise ValueError("A auditoria exige exatamente 100 registros")

    source_ids = [row["id"] for row in source_rows]
    target_ids = [row["id"] for row in rows]
    if target_ids != source_ids:
        raise ValueError("IDs ou ordem não correspondem aos registros-fonte 101–200")

    before = {row["id"]: dict(row) for row in rows}
    for row in rows:
        row.update(OVERRIDES.get(row["id"], {}))

    categories = {
        "Cobrança Indevida",
        "Atendimento",
        "Fraude/Segurança",
        "Produto/Serviço",
        "Cancelamento",
        "Outros",
    }
    products = {
        "Cartão de Crédito",
        "Conta Corrente",
        "Empréstimo",
        "Investimentos",
        "Seguros",
        "Não Identificado",
    }
    sentiments = {"Positivo", "Neutro", "Negativo", "Crítico"}
    urgencies = {"Baixa", "Média", "Alta", "Crítica"}
    risks = {"Baixo", "Médio", "Alto", "Crítico"}

    source_by_id = {row["id"]: row for row in source_rows}
    for row in rows:
        if row["expected_category"] not in categories:
            raise ValueError(f"Categoria inválida em {row['id']}")
        if row["expected_product"] not in products:
            raise ValueError(f"Produto inválido em {row['id']}")
        if row["expected_sentiment"] not in sentiments:
            raise ValueError(f"Sentimento inválido em {row['id']}")
        if row["expected_urgency"] not in urgencies:
            raise ValueError(f"Urgência inválida em {row['id']}")
        if row["expected_risk"] not in risks:
            raise ValueError(f"Risco inválido em {row['id']}")
        if any(row[field] not in {"true", "false"} for field in BOOL_FIELDS):
            raise ValueError(f"Booleano inválido em {row['id']}")

        has_threat = any(
            row[field] == "true"
            for field in (
                "expected_prompt_injection",
                "expected_exfiltration_request",
                "expected_unauthorized_data_access",
                "expected_external_exfiltration",
            )
        )
        if has_threat or row["expected_fraud_signal"] == "true":
            if (
                row["expected_urgency"],
                row["expected_risk"],
                row["expected_immediate_escalation"],
            ) != ("Crítica", "Crítico", "true"):
                raise ValueError(f"Incoerência de ameaça/fraude em {row['id']}")

        if row["expected_fraud_signal"] == "true" and not has_threat:
            if row["expected_category"] != "Fraude/Segurança":
                raise ValueError(f"Categoria incoerente com fraude em {row['id']}")

        if source_by_id[row["id"]]["canal"] in {"Banco Central", "Procon"}:
            if (
                row["expected_urgency"],
                row["expected_risk"],
                row["expected_reputational_risk"],
                row["expected_immediate_escalation"],
            ) != ("Crítica", "Crítico", "true", "true"):
                raise ValueError(f"Incoerência de canal regulatório em {row['id']}")

        if len(row["rationale"]) > 140:
            raise ValueError(f"Rationale longo em {row['id']}")
        if re.search(
            r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{4,6}-\d\b|"
            r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b",
            row["rationale"],
        ):
            raise ValueError(f"PII presente no rationale de {row['id']}")

    counts = Counter()
    for row in rows:
        original = before[row["id"]]
        for field in fieldnames:
            if row[field] != original[field]:
                counts[field] += 1

    with TARGET.open("w", newline="", encoding="utf-8") as target_file:
        writer = csv.DictWriter(target_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(json.dumps(dict(counts), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
