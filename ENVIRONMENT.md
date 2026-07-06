Environment updates

Added

NEXT_PUBLIC_CINCH_CCM_URL

NEXT_PUBLIC_AXISCARE_URL

NEXT_PUBLIC_APPLOI_URL

NEXT_PUBLIC_VIVENTIUM_URL

NEXT_PUBLIC_DIALPAD_URL

NEXT_PUBLIC_GMAIL_URL

NEXT_PUBLIC_SERVE_INTAKE_URL

Updated

SERVE_APP_URL

https://os-servecaregiving.netlify.app

Hostname corrected

servercaregiving

↓

servecaregiving

## Required Environment Variables

SUPABASE_URL

SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

SERVE_NOTIFICATION_FROM

SERVE_NOTIFICATION_REPLY_TO

SERVE_NOTIFY_WEBSITE_INTAKE

SERVE_SUPPORTED_ZIPS (optional)

Current production website does not yet require all variables because production still uses native Netlify Forms.

## Serve Website

Added production environment variables for:

- Supabase
- Resend
- Notification recipients
- Serve App URL

Website infrastructure now mirrors Serve OS environment configuration where appropriate.

## Development Environment

New active branches

serve-website

- feature/conversational-get-started
- feature/progressive-homepage-intake

serve-os

- feature/professional-referral-admin-display

Netlify Deploy Previews available for homepage UX evaluation.

