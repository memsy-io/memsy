# Contributing

Thanks for your interest in contributing to Memsy. This repo hosts the SDKs, connectors, and docs that ship to end users.

## Repo layout

```
memsy/
├── sdks/
│   ├── python/      ← Python SDK (pip install memsy)
│   └── node/        ← Node.js SDK (npm install @memsy-io/memsy)
├── connectors/      ← Claude MCP, OpenAI, LangChain, LlamaIndex (coming soon)
└── docs/            ← docs.memsy.io source
```

## How to contribute

1. Fork this repository.
2. Create a branch: `git checkout -b feat/your-feature`.
3. Make your changes inside the relevant `sdks/`, `connectors/`, or `docs/` folder.
4. Open a pull request against `main` with a clear description of what you changed and why.

## Per-SDK guidelines

### `sdks/python/`

```bash
cd sdks/python
uv sync
uv run pytest tests/ -v        # all tests pass before submitting
uv run ruff check .            # lint clean
```

### `sdks/node/`

```bash
cd sdks/node
npm install
npm test                       # all tests pass before submitting
npm run build                  # types + dist build cleanly
```

## Docs

Docs live in `docs/` (Next.js). To run locally:

```bash
cd docs
npm install
npm run dev
```

Content lives under `docs/content/docs/` as MDX. PRs that touch docs should keep the existing tone — direct, code-first, no marketing fluff.

## Reporting bugs / feature requests

[Open an issue](https://github.com/memsy-io/memsy/issues) with:
- What you tried (code snippet + expected vs actual)
- SDK + version (`memsy --version` or `package.json`)
- Memsy API base URL if not the default

## License

All contributions are licensed under MIT (see [LICENSE](LICENSE)).
