export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function jsonResult(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function formatError(toolName: string, err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.constructor.name : "Error";
  // Include the error class so callers can distinguish auth / rate-limit / etc.
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { tool: toolName, error: name, message },
          null,
          2,
        ),
      },
    ],
  };
}

