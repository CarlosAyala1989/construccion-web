"use client";

import { AppIcon } from "@/components/AppIcon";
import { getSession, signIn } from "next-auth/react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      getResponse: () => string;
      reset: () => void;
    };
  }
}

// RF-19
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const captchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!captchaSiteKey) {
      setError("El acceso seguro aún no está configurado. Contacta al administrador.");
      return;
    }

    const captchaToken = window.grecaptcha?.getResponse();
    if (!captchaToken) {
      setError("Confirma que no eres un robot antes de continuar.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await signIn("credentials", {
        redirect: false,
        email,
        password,
        captchaToken,
        totpCode,
      });

      if (response?.error) {
        setError(response.error);
        window.grecaptcha?.reset();
        return;
      }

      const session = await getSession();
      router.push(session?.user?.role === "ADMIN" ? "/dashboard" : "/documents");
    } catch {
      setError("No se pudo iniciar sesión. Inténtalo nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-shell">
      {captchaSiteKey && (
        <Script src="https://www.google.com/recaptcha/api.js" strategy="afterInteractive" />
      )}

      <section className="login-story" aria-label="Plataforma de gobernanza documental">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>DocuZen</span>
        </div>

        <div className="login-story-content">
          <p className="login-kicker">Control documental para tu organización</p>
          <h1>Protege cada documento. Entiende cada acceso.</h1>
          <p className="login-story-copy">
            Centraliza documentos, permisos y trazabilidad en una experiencia clara para
            administradores y equipos de trabajo.
          </p>
        </div>

        <div className="login-story-footer" aria-label="Capacidades principales">
          <span><AppIcon name="shield" /> Acceso protegido</span>
          <span><AppIcon name="workspaces" /> Espacios organizados</span>
          <span><AppIcon name="activity" /> Historial verificable</span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <h2>Inicia sesión</h2>
          <p className="login-intro">Accede con las credenciales asignadas por tu administrador.</p>

          <form className="form-stack" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="form-alert" role="alert" aria-live="polite">
                <AppIcon name="alert" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email-address" className="field-label">Correo electrónico</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                className="field-control"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="field-label">Contraseña</label>
              <div className="password-control">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="field-control"
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(current => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                >
                  <AppIcon name={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="totp-code" className="field-label">Código de verificación</label>
              <input
                id="totp-code"
                name="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                className="field-control"
                placeholder="6 dígitos"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-describedby="totp-help"
              />
              <p id="totp-help" className="field-hint">
                Déjalo vacío si tu cuenta aún no usa Authenticator.
              </p>
            </div>

            {captchaSiteKey ? (
              <div className="captcha-wrap">
                <div className="g-recaptcha" data-sitekey={captchaSiteKey} />
              </div>
            ) : (
              <div className="form-alert warning" role="status">
                <AppIcon name="alert" />
                <span>El acceso está pendiente de configuración por el administrador.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !captchaSiteKey}
              className="primary-button login-submit"
            >
              {isLoading && <span className="spinner" aria-hidden="true" />}
              {isLoading ? "Verificando acceso…" : "Continuar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
