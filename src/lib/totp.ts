import QRCode from "qrcode";
import { generateSecret, generateURI, verify } from "otplib";

const DEFAULT_AUTHENTICATOR_ISSUER = "Gobernanza Documental";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export type AuthenticatorSetup = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export function createTotpSecret() {
  return generateSecret({ length: 20 });
}

export async function createAuthenticatorSetup(email: string, secret = createTotpSecret()): Promise<AuthenticatorSetup> {
  const issuer = process.env.AUTHENTICATOR_ISSUER || DEFAULT_AUTHENTICATOR_ISSUER;
  const otpauthUrl = generateURI({
    issuer,
    label: email,
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export async function verifyTotpCode(secret: string | null | undefined, code: string | null | undefined) {
  const normalizedCode = code?.replace(/\s+/g, "") || "";

  if (!secret || !/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  try {
    const result = await verify({
      secret,
      token: normalizedCode,
      epochTolerance: TOTP_PERIOD_SECONDS,
    });

    return result.valid;
  } catch {
    return false;
  }
}
