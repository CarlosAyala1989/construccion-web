# Seguridad del login web: reCAPTCHA y Authenticator

Este proyecto ahora valida dos controles en el login web:

- reCAPTCHA v2 checkbox: obligatorio antes de enviar email y contraseña.
- Authenticator TOTP: código de 6 dígitos para usuarios con 2FA activo.

## 1. Configurar reCAPTCHA en Google Cloud

1. Entra a Google Cloud Console y selecciona o crea un proyecto.
2. Ve a reCAPTCHA y crea una clave para sitio web.
3. Usa una clave tipo checkbox/challenge para reCAPTCHA v2.
4. Agrega los dominios permitidos:
   - Producción: el dominio real del sistema.
   - Desarrollo: `localhost` si vas a probar localmente.
5. Copia la clave pública del sitio y la clave secreta.

Variables necesarias:

```env
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=clave_publica_del_sitio
RECAPTCHA_SECRET_KEY=clave_secreta_del_servidor
```

`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` se usa en el navegador y debe existir al compilar/desplegar Next.js. `RECAPTCHA_SECRET_KEY` solo se usa en el servidor y no debe compartirse.

Para pruebas locales automatizadas, Google publica claves de prueba de reCAPTCHA v2 que siempre pasan la verificación; no las uses en producción.

Fuentes oficiales:

- Crear claves web: https://docs.cloud.google.com/recaptcha/docs/create-key-website
- Mostrar reCAPTCHA v2 checkbox: https://developers.google.com/recaptcha/docs/display
- Validar el token en backend: https://developers.google.com/recaptcha/docs/verify
- Claves de prueba: https://developers.google.com/recaptcha/docs/faq

## 2. Aplicar la migración de base de datos

El usuario ahora tiene campos para Authenticator:

- `twoFactorEnabled`
- `twoFactorSecret`
- `twoFactorConfirmedAt`

En producción:

```bash
npx prisma migrate deploy
npx prisma generate
```

En desarrollo:

```bash
npx prisma migrate dev
```

## 3. Configurar Authenticator

No necesitas Google Cloud para esto. Google Authenticator, Microsoft Authenticator y apps similares usan el estándar TOTP.

Funcionamiento:

- El administrador genera un secreto por usuario desde `Dashboard > Usuarios > Authenticator`.
- El sistema muestra un QR y una clave manual.
- El usuario escanea el QR en su app Authenticator.
- El administrador ingresa el código de 6 dígitos que muestra la app.
- Si el código es válido, la cuenta queda con 2FA activo.
- Desde ese momento, el login web exige email, contraseña, CAPTCHA y código Authenticator.

Variable opcional:

```env
AUTHENTICATOR_ISSUER=Gobernanza Documental
AUTHENTICATOR_REQUIRED=false
```

Si pones `AUTHENTICATOR_REQUIRED=true`, el sistema bloqueará el login de cuentas que todavía no tienen Authenticator activo. Actívalo solo después de configurar el administrador y los usuarios web necesarios.

## 4. Flujo operativo recomendado

1. Configura reCAPTCHA y despliega con las variables de entorno.
2. Aplica la migración Prisma.
3. Inicia sesión como administrador.
4. En `Dashboard > Usuarios`, abre `Authenticator` para tu cuenta admin.
5. Escanea el QR y confirma el código.
6. Repite el proceso para cada usuario web.
7. Cuando todos estén configurados, opcionalmente activa `AUTHENTICATOR_REQUIRED=true`.

## 5. Notas de seguridad

- El secreto TOTP no se devuelve en `/api/users`; solo se muestra durante la configuración del QR.
- Si un usuario pierde su app Authenticator, un administrador puede desactivar Authenticator y generar un nuevo QR.
- reCAPTCHA valida el token en backend contra Google antes de comparar credenciales.
- El token de reCAPTCHA es de un solo uso y vence rápidamente, por eso el login reinicia el CAPTCHA cuando hay error.
