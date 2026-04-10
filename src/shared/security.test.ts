import { test } from "node:test";
import assert from "node:assert";
import { getSafeUrl, escapeHtml, sanitizeSvg } from "./security.ts";

test("getSafeUrl", () => {
  assert.strictEqual(getSafeUrl("https://example.com"), "https://example.com");
  assert.strictEqual(getSafeUrl("http://example.com"), "http://example.com");
  assert.strictEqual(getSafeUrl("mailto:test@example.com"), "mailto:test@example.com");
  assert.strictEqual(getSafeUrl("tel:+123456789"), "tel:+123456789");
  assert.strictEqual(getSafeUrl("/local/path"), "/local/path");
  assert.strictEqual(getSafeUrl("#anchor"), "#anchor");

  // malicious urls
  assert.strictEqual(getSafeUrl("javascript:alert(1)"), "#");
  assert.strictEqual(getSafeUrl("data:text/html,<script>alert(1)</script>"), "#");
  assert.strictEqual(getSafeUrl("vbscript:msgbox('hi')"), "#");
});

test("escapeHtml", () => {
  assert.strictEqual(escapeHtml("<script>"), "&lt;script&gt;");
  assert.strictEqual(escapeHtml('\"'), "&quot;");
  assert.strictEqual(escapeHtml("\'"), "&#039;");
  assert.strictEqual(escapeHtml("&"), "&amp;");
});

test("sanitizeSvg", () => {
  const safeSvg = '<svg><path d="M10 10"/></svg>';
  assert.strictEqual(sanitizeSvg(safeSvg), safeSvg);

  const maliciousSvg = '<svg><script>alert(1)</script><path d="M10 10"/></svg>';
  assert.contains(sanitizeSvg(maliciousSvg), '<svg><path d="M10 10"/></svg>');
  assert.doesNotContain(sanitizeSvg(maliciousSvg), '<script>');

  const maliciousAttr = '<svg><path onclick="alert(1)" d="M10 10"/></svg>';
  assert.strictEqual(sanitizeSvg(maliciousAttr), '<svg><path d="M10 10"/></svg>');

  const maliciousXlink = '<svg><a xlink:href="javascript:alert(1)"><circle r="10"/></a></svg>';
  assert.contains(sanitizeSvg(maliciousXlink), 'href="#"');
  assert.doesNotContain(sanitizeSvg(maliciousXlink), 'javascript:');
});

assert.contains = (actual: string, expected: string) => {
  if (!actual.includes(expected)) {
    assert.fail(`Expected "${actual}" to contain "${expected}"`);
  }
};
assert.doesNotContain = (actual: string, expected: string) => {
  if (actual.includes(expected)) {
    assert.fail(`Expected "${actual}" to NOT contain "${expected}"`);
  }
};
