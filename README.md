# Memsy

Persistent memory for AI agents and applications. 88.12% on LoCoMo — the highest accuracy of any memory library at k≤20, at 4× better score-per-token than mem0.

📚 **Docs**: [docs.memsy.io](https://docs.memsy.io) &nbsp;|&nbsp; 🌐 **Website**: [memsy.io](https://memsy.io)

---

## SDKs

| Language | Package | Install |
|----------|---------|---------|
| Python | [memsy-io/sdks/python](https://github.com/memsy-io/memsy/tree/main/sdks/python) | `pip install memsy` |
| Node.js | [memsy-io/sdks/node](https://github.com/memsy-io/memsy/tree/main/sdks/node) | `npm install @memsy-io/memsy` |

## Quick Start

**Python**
```python
from memsy import MemsyClient, EventPayload

client = MemsyClient(base_url="https://api.memsy.io", api_key="msy_...")

# Store a memory
client.ingest([EventPayload(
    actor_id="user_1",
    session_id="session_1",
    kind="user_message",
    content="I prefer dark mode in all apps",
)])

# Recall it later
results = client.search("user preferences", actor_id="user_1")
for r in results.results:
    print(r.content)
```

**Node.js**
```ts
import { MemsyClient } from "@memsy-io/memsy";

const client = new MemsyClient({ baseUrl: "https://api.memsy.io", apiKey: "msy_..." });

// Store a memory
await client.ingest([{
  actorId: "user_1",
  sessionId: "session_1",
  kind: "user_message",
  content: "I prefer dark mode in all apps",
}]);

// Recall it later
const { results } = await client.search("user preferences", { actorId: "user_1" });
results.forEach(r => console.log(r.content));
```

## Why Memsy

| | Memsy | mem0 |
|---|---|---|
| LoCoMo Score | **88.12%** | 82.7% |
| Tokens per query | ~1,700 | ~7,000 |
| Score / 1K tokens | **51.8** | 13.1 |

Benchmark: full LoCoMo suite (1,540 questions), GPT-4.1 Mini, single pass, no post-processing. [Full results →](https://github.com/memsy-io/memsy/blob/main/benchmark/BENCHMARK_RESULTS.md)

## Connectors

Coming soon: Claude MCP, OpenAI, LangChain, LlamaIndex.

## Repository Structure

```
memsy/
├── sdks/
│   ├── python/       ← Python SDK (pip install memsy)
│   └── node/         ← Node.js SDK (npm install @memsy-io/memsy)
└── connectors/       ← Claude, OpenAI and other connectors (coming soon)
```

## Contributing

We welcome contributions to any SDK or connector in this repo. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide — repo layout, per-SDK setup, and PR conventions.

For bugs or feature requests, [open an issue](https://github.com/memsy-io/memsy/issues).

## License

MIT
