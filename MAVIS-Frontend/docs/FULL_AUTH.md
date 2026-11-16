# Authentication UI

The frontend connects all currently implemented Java authentication APIs:

- /login: POST /auth/login; session GET /auth/me; local sign-out clears the HttpOnly cookie.
- /auth/register: POST /auth/register then opens /auth/verify with the email.
- /auth/verify: POST /auth/verify-email and POST /auth/resend-otp.
- /auth/forgot-password: POST /auth/forgot-password then /auth/reset-password.
- /auth/reset-password: POST /auth/reset-password; success returns to login.
- Google sign-in: Google Identity Services supplies an ID token to POST /auth/google. Returned Java JWT is stored only in HttpOnly cookie and omitted from JSON.

Use matching Java/FE revisions in backend mode. OTP email delivery requires actual MAIL_USERNAME/MAIL_PASSWORD settings. Current local SMTP was previously reporting 535 BadCredentials; a successful API response does not prove email delivery because Java sends mail asynchronously. Do not expose OTPs in production UI or bypass verification to hide mail failures.

Set MAVIS_GOOGLE_CLIENT_ID in local settings for the Google button. Start-Mavis also passes the same ID as APP_GOOGLE_CLIENT_ID to Java. Register the exact frontend origin (for example http://127.0.0.1:3000) in Google's web client configuration. This client ID is public configuration, not a client secret. Without the ID, Google is not advertised as configured. No raw token paste form is shown.

Java currently has no refresh-token or global token-revocation endpoint. Sign-out is local cookie/session removal; the UI does not invent stronger guarantees.

Validation: 26 FE tests passed, including mapping all public auth operations without a previous session, same-origin guards, payload checks and HttpOnly Google exchange. Typecheck/build pass. Mail delivery and real Google account consent require valid external configuration and are not claimed as passed by mocked contract tests.
