# 4663

4663 is a live intelligence canvas for Robinhood Chain.

## MVP flow

PONS launches  
→ observe strict first-time buying behaviour  
→ emit meaningful multi-wallet buying events  
→ display them on a shared live canvas

## Infrastructure direction

Robinhood Chain  
→ Alchemy  
→ Render worker  
→ Supabase  
→ 4663 web canvas

## System notes

- Chain ID: `4663`
- Canonical system time: UTC
- Website: Vercel
- Worker: Render
- Database / realtime: Supabase
- RPC: Alchemy
- No accounts or authentication in MVP

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill values as integrations are added.
