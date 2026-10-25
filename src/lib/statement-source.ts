import { z } from "zod";

export const statementResultSchema = z.object({
  rows: z.array(z.object({
    description: z.string(), vendor: z.string(), amount: z.number(), expense_date: z.string(),
    category: z.string(), warning: z.string(), original_text: z.string().min(1), source_location: z.string(),
  })),
  warnings: z.array(z.string()),
});

/** Whitespace layout can change in transcription; the underlying words and amounts may not. */
export function sourceTextMatches(original: string, document: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const text = normalize(original);
  return text.length > 0 && normalize(document).includes(text);
}