# Memsy Python SDK — docs site

Public documentation for the [`memsy`](https://pypi.org/project/memsy/) Python SDK. Built with [Unmint](https://github.com/gregce/unmint) (Next.js 16 + Fumadocs + Tailwind).

## Local development

```bash
npm install
npm run dev          # dev server at http://localhost:3000
npm run build        # production build (.next/)
npm run start        # serve the production build
npm run lint         # eslint
npm run test         # vitest
```

## Where things live

```
docs/
├── app/                       # Next.js app router routes
│   ├── docs/[[...slug]]       # dynamic docs route
│   ├── api/og                 # OG image generator
│   └── api/search             # search endpoint
├── content/
│   └── docs/                  # MDX pages — write content here
│       ├── meta.json          # sidebar order + section separators
│       └── *.mdx
├── lib/
│   └── theme-config.ts        # branding: colors, logo, links
└── public/                    # static assets (logo, favicon)
```

## Adding a page

1. Create a new `.mdx` file under `content/docs/`.
2. Add it to `content/docs/meta.json` in the desired sidebar position.
3. Frontmatter takes `title` and `description`.

Available MDX components: `<CardGroup>` / `<Card>`, `<Steps>` / `<Step>`, `<Tabs>` / `<Tab>`, `<AccordionGroup>` / `<Accordion>`, `<Info>` / `<Tip>` / `<Warning>` / `<Note>` / `<Check>`. See any existing page (e.g. `content/docs/quickstart.mdx`) for usage.

## Branding

All colors, logo, footer, and link metadata live in `lib/theme-config.ts`. Edit there, no global CSS overrides needed.

## Deployment (Vercel)

Configure once in the Vercel project UI:

- **Root Directory**: `docs/`
- **Framework Preset**: Next.js (auto-detected)
- Production domain: e.g. `docs.memsy.io`

No `vercel.json` required. Pushing to `main` deploys; PRs get preview URLs automatically.

## Placeholders to replace before going public

- `lib/theme-config.ts` — `<ORG>` placeholder in the GitHub URL.
- `lib/theme-config.ts` — `ogImage.logoUrl` (needs absolute URL once deployed).
- `public/logo.svg` and favicon — currently the Unmint defaults.
