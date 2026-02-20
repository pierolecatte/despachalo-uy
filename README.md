This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Variables de Entorno

Copiar `.env.local.example` o crear `.env.local` en la raíz:

| Variable | Tipo | Requerida | Descripción |
|----------|------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | ✅ | Anon key de Supabase |
| `OPENAI_API_KEY` | **server-only** | Para importador IA | Key de OpenAI (gpt-4o-mini) |

> ⚠️ **No usar `NEXT_PUBLIC_OPENAI_API_KEY`** — la key debe ser server-only.
> `.env.local` ya está en `.gitignore`, no se commitea.

### Verificar configuración

```bash
# Iniciar server
npm run dev

# Chequear OpenAI
curl http://localhost:3000/api/import/status
# → { "openaiConfigured": true }
```

### Deploy en Vercel

1. En **Settings → Environment Variables**, agregar `OPENAI_API_KEY`
2. Redeploy

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
