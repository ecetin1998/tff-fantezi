# Profile email ownership verification

Supabase **Confirm email** stays OFF for frictionless registration.

## One-time Supabase email template configuration
Dashboard → Authentication → Email Templates → **Magic Link**.
Set the confirmation link target to:

```html
<a href="https://fanteziligrehberi.com/auth/verify-email?token_hash={{ .TokenHash }}&type=magiclink">E-posta adresimi doğrula</a>
```

Keep the surrounding email text and branding as desired. The callback verifies the
single-use OTP before writing to `public.scout_email_verifications` using the
server-only `SUPABASE_SERVICE_ROLE_KEY` Cloudflare secret.

Do not put the service role key in GitHub, `NEXT_PUBLIC_*`, or build variables.

## Manual acceptance checks
1. Sign up with a new email: no confirmation needed, user lands on homepage.
2. Profile: "Doğrulanmadı" and verify button shown.
3. Click verify: email arrives; follow link; profile becomes "Doğrulandı".
4. Refresh profile: status persists. Reuse link: should not mark any other email.
5. Request password reset: unchanged.
6. Pro waitlist remains available to unverified accounts; **future paid activation
   must enforce the verification table server-side**.
