import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export const Badge = ({ tone = "neutral", children }: { tone?: BadgeTone; children?: ReactNode }) => <span data-tone={tone}>{children}</span>;
