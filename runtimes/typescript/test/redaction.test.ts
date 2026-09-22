import assert from "node:assert/strict";
import test from "node:test";

import { containsPii, redactForPublic } from "../src/core/redaction.js";

test("detects and redacts common FinGuard identifiers", () => {
  const value = "CPF 123.456.789-00, conta 12345-6, email pessoa@example.com e https://external.invalid/a";
  assert.equal(containsPii(value), true);
  const redacted = redactForPublic(value);
  assert.doesNotMatch(redacted, /123\.456\.789-00|12345-6|pessoa@example\.com|external\.invalid/);
});
