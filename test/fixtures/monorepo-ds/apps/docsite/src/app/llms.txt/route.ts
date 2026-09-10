import { allGuides } from "@/lib/guides";

export function GET() {
    const body = allGuides()
        .map((g) => `# ${g.title}\n${g.body}`)
        .join("\n\n");
    return new Response(body, { headers: { "content-type": "text/plain" } });
}
