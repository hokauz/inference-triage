const cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const card = /\b(?:\d[ -]?){13,19}\b/g;
const phone = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}\b/g;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const account = /\b(?:conta|c\/c|cc)\s*(?:n[ºo.]?\s*)?\d{4,}-?\d*\b/gi;
const url = /https?:\/\/[^\s)]+/gi;

export function containsPii(text: string): boolean {
  return [cpf, card, phone, email, account].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function redactForPublic(text: string): string {
  return text
    .replace(cpf, "[CPF REDACTED]")
    .replace(card, "[CARD REDACTED]")
    .replace(phone, "[PHONE REDACTED]")
    .replace(email, "[EMAIL REDACTED]")
    .replace(account, "[ACCOUNT REDACTED]")
    .replace(url, "[URL REDACTED]");
}
