import { readFileSync } from "node:fs";

import { sha256, textHash } from "./hashing.js";
import type { IngestedComplaint, IngestionReport, RejectedRow, Taxonomy } from "./types.js";

const requiredHeaders = ["id", "data_reclamacao", "canal", "texto_reclamacao", "produto", "status"];

export interface IngestionResult {
  complaints: IngestedComplaint[];
  report: IngestionReport;
  datasetHash: string;
}

function parseRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function ingestCsv(path: string, taxonomy: Taxonomy): IngestionResult {
  const buffer = readFileSync(path);
  const content = buffer.toString("utf8");
  const rows = parseRows(content);
  if (!rows.length) throw new Error("CSV is empty");

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`CSV is missing headers: ${missingHeaders.join(", ")}`);

  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const missingByField: Record<string, number> = Object.fromEntries(requiredHeaders.map((key) => [key, 0]));
  const unexpected = { channel: new Set<string>(), product: new Set<string>(), status: new Set<string>() };
  const rejectedRows: RejectedRow[] = [];
  const complaints: IngestedComplaint[] = [];
  const ids = new Set<string>();

  for (let offset = 1; offset < rows.length; offset += 1) {
    const row = rows[offset];
    const values = Object.fromEntries(headers.map((header, position) => [header, (row[position] ?? "").trim()]));
    const reasons: string[] = [];
    for (const field of requiredHeaders) {
      if (!values[field]) missingByField[field] += 1;
    }
    for (const field of ["id", "data_reclamacao", "canal", "texto_reclamacao", "status"]) {
      if (!values[field]) reasons.push(`missing_${field}`);
    }
    if (values.id && ids.has(values.id)) reasons.push("duplicate_id");
    if (values.data_reclamacao && !/^\d{4}-\d{2}-\d{2}$/.test(values.data_reclamacao)) reasons.push("invalid_date");
    if (reasons.length) {
      rejectedRows.push({ rowNumber: offset + 1, reasons });
      continue;
    }
    ids.add(values.id);

    if (!taxonomy.channels.some((value) => normalized(value) === normalized(values.canal))) unexpected.channel.add(values.canal);
    if (values.produto && !taxonomy.products.some((value) => normalized(value) === normalized(values.produto))) unexpected.product.add(values.produto);
    if (!taxonomy.statuses.some((value) => normalized(value) === normalized(values.status))) unexpected.status.add(values.status);

    complaints.push({
      id: values.id,
      occurredAt: values.data_reclamacao,
      channel: values.canal,
      rawText: values.texto_reclamacao,
      sourceProduct: values.produto || null,
      sourceStatus: values.status,
      textHash: textHash(values.texto_reclamacao),
    });
  }

  return {
    complaints,
    datasetHash: sha256(buffer),
    report: {
      inputCount: rows.length - 1,
      acceptedCount: complaints.length,
      rejectedCount: rejectedRows.length,
      missingByField,
      unexpectedValues: Object.fromEntries(
        Object.entries(unexpected).map(([key, values]) => [key, [...values].sort()]),
      ),
      rejectedRows,
    },
  };
}
