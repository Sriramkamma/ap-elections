# AP Election Command Centre 2026

Vite + React + TS + Tailwind frontend, Vercel serverless API (`api/data.ts`), Google Sheets (service account, read-only), Upstash Redis for frozen snapshots.

## Run
```bash
npm install
npm i -g vercel
vercel link && vercel env pull .env.local
vercel dev        # Vite + /api together
```
Google Sheets credentials are required. Without them, the API returns a configuration error and does not show synthetic election data.

## Connect your sheet
1. Enable Google Sheets API + Drive API; create a service account + JSON key.
2. Share the sheet with the service account email (Viewer).
3. Edit `api/_lib/config.ts` (tab names, level, optional header overrides).
4. Set env vars in Vercel (see `.env.example`). `GOOGLE_PRIVATE_KEY` keeps literal `\n`.
5. Add Upstash Redis via Vercel Marketplace (sets the UPSTASH_* vars).
6. `vercel --prod`

`DASHBOARD_ACCESS_KEY` is enforced server-side; `VITE_REQUIRE_KEY=1` only shows the login box.
