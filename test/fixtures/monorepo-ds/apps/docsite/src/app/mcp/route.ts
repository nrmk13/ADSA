import { createMcpHandler } from "mcp-handler";

const handler = createMcpHandler((server) => {
    server.tool("search", "Find a component by task", async ({ query }) => search(query));
    server.tool("get", "Read a component guide in full", async ({ name }) => guide(name));
});

export { handler as GET, handler as POST };
