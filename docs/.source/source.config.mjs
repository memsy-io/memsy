// source.config.ts
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { rehypeCode } from "fumadocs-core/mdx-plugins";
var docs = defineDocs({
  dir: "content/docs"
});
var source_config_default = defineConfig({
  mdxOptions: {
    rehypePlugins: [
      [
        rehypeCode,
        {
          themes: {
            light: "github-light",
            dark: "github-dark"
          }
        }
      ]
    ]
  }
});
export {
  source_config_default as default,
  docs
};
