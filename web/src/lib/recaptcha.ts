const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const TEST_SECRET_KEY = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

// Google provides these keys for local tests. They always pass and therefore
// must never be mistaken for real bot protection.
export function recaptchaSiteKey() {
  if (process.env.RECAPTCHA_TEST_MODE === "true") return TEST_SITE_KEY;
  return process.env.RECAPTCHA_SITE_KEY ?? null;
}

export async function verifyRecaptcha(token: unknown, request: Request) {
  const testMode = process.env.RECAPTCHA_TEST_MODE === "true";
  if (testMode && !["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname))
    return { ok: false, reasonCode: "RECAPTCHA_NOT_CONFIGURED" };
  const secret = testMode ? TEST_SECRET_KEY : process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || !recaptchaSiteKey()) return { ok: false, reasonCode: "RECAPTCHA_NOT_CONFIGURED" };
  if (typeof token !== "string" || !token || token.length > 4096) return { ok: false, reasonCode: "RECAPTCHA_REQUIRED" };
  // Automated local checks use an explicit marker. This works only when the
  // developer has enabled test mode; deployed sites must use real keys.
  if (testMode && token === "local-test") return { ok: true };
  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) return { ok: false, reasonCode: "RECAPTCHA_UNAVAILABLE" };
    const result = await response.json() as { success?: boolean; hostname?: string };
    if (!result.success) return { ok: false, reasonCode: "RECAPTCHA_FAILED" };
    // Real keys are domain-bound; also check the reported hostname here.
    const expected = process.env.RECAPTCHA_EXPECTED_HOSTNAME ?? new URL(request.url).hostname;
    if (!testMode && result.hostname !== expected) return { ok: false, reasonCode: "RECAPTCHA_HOSTNAME_MISMATCH" };
    return { ok: true };
  } catch { return { ok: false, reasonCode: "RECAPTCHA_UNAVAILABLE" }; }
}
