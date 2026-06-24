type RecaptchaVerifyResponse = {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

type RecaptchaResult = {
  ok: boolean;
  message?: string;
};

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export async function verifyRecaptchaToken(token: string | undefined | null): Promise<RecaptchaResult> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    return {
      ok: false,
      message: "CAPTCHA no configurado. Falta RECAPTCHA_SECRET_KEY en el servidor.",
    };
  }

  if (!token) {
    return {
      ok: false,
      message: "Marca el CAPTCHA antes de iniciar sesión.",
    };
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        message: "No se pudo validar el CAPTCHA. Inténtalo nuevamente.",
      };
    }

    const data = (await response.json()) as RecaptchaVerifyResponse;

    if (!data.success) {
      return {
        ok: false,
        message: "CAPTCHA inválido o vencido. Vuelve a marcarlo.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Error al validar el CAPTCHA. Inténtalo nuevamente.",
    };
  }
}
