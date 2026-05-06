// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"actors-and-sessions.mdx": () => import("../content/docs/actors-and-sessions.mdx?collection=docs"), "async-client.mdx": () => import("../content/docs/async-client.mdx?collection=docs"), "async-memsy-client.mdx": () => import("../content/docs/async-memsy-client.mdx?collection=docs"), "async-processing.mdx": () => import("../content/docs/async-processing.mdx?collection=docs"), "console-memories.mdx": () => import("../content/docs/console-memories.mdx?collection=docs"), "control-client.mdx": () => import("../content/docs/control-client.mdx?collection=docs"), "error-handling.mdx": () => import("../content/docs/error-handling.mdx?collection=docs"), "events-and-memories.mdx": () => import("../content/docs/events-and-memories.mdx?collection=docs"), "exceptions.mdx": () => import("../content/docs/exceptions.mdx?collection=docs"), "faq.mdx": () => import("../content/docs/faq.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "ingesting-events.mdx": () => import("../content/docs/ingesting-events.mdx?collection=docs"), "installation.mdx": () => import("../content/docs/installation.mdx?collection=docs"), "memsy-client.mdx": () => import("../content/docs/memsy-client.mdx?collection=docs"), "models.mdx": () => import("../content/docs/models.mdx?collection=docs"), "onboarding.mdx": () => import("../content/docs/onboarding.mdx?collection=docs"), "quickstart.mdx": () => import("../content/docs/quickstart.mdx?collection=docs"), "retries.mdx": () => import("../content/docs/retries.mdx?collection=docs"), "searching-memory.mdx": () => import("../content/docs/searching-memory.mdx?collection=docs"), "signup.mdx": () => import("../content/docs/signup.mdx?collection=docs"), "usage-and-rate-limits.mdx": () => import("../content/docs/usage-and-rate-limits.mdx?collection=docs"), }),
};
export default browserCollections;