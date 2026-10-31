/** Optional publishing metadata, separate from manuscript text and print design. */
export type PublicationMetadata = {
  subtitle?: string;
  seriesName?: string;
  seriesNumber?: string;
  publisher?: string;
  isbn?: string;
  description?: string;
  publicationDate?: string;
};
export const PUBLICATION_LIMITS = {
  subtitle: 200, seriesName: 200, seriesNumber: 30,
  publisher: 200, isbn: 17, description: 4000, publicationDate: 10,
} as const;

export function normalizedIsbn(value: string): string {
  return value.replace(/[\s-]/g, "");
}
export function validIsbn13(value: string): boolean {
  const digits = normalizedIsbn(value);
  if (!/^(?:978|979)\d{10}$/.test(digits)) return false;
  const sum = [...digits.slice(0, 12)].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(digits[12]);
}
export function validPublicationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function validatePublicationMetadata(value: unknown): PublicationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid publication metadata.");
  const fields = Object.keys(PUBLICATION_LIMITS) as (keyof PublicationMetadata)[];
  const metadata = value as Record<string, unknown>;
  if (Object.keys(metadata).some(key => !fields.includes(key as keyof PublicationMetadata)))
    throw Error("Unsupported publication metadata field.");
  for (const field of fields) {
    const content = metadata[field];
    if (content !== undefined && (typeof content !== "string" || content.length > PUBLICATION_LIMITS[field]))
      throw Error(`Invalid ${field}: exceeds its length limit or is not text.`);
  }
  if (metadata.isbn && !validIsbn13(metadata.isbn as string))
    throw Error("ISBN must be a valid ISBN-13, including its check digit.");
  if (metadata.publicationDate && !validPublicationDate(metadata.publicationDate as string))
    throw Error("Publication date must be a real calendar date in YYYY-MM-DD format.");
  if (metadata.seriesNumber && !/^\d+(?:\.\d+)?$/.test(metadata.seriesNumber as string))
    throw Error("Series number must be positive numeric text, such as 1 or 1.5.");
  if (metadata.seriesNumber && Number(metadata.seriesNumber) <= 0)
    throw Error("Series number must be greater than zero.");
  if (metadata.seriesNumber && !(metadata.seriesName as string | undefined)?.trim())
    throw Error("Enter a series name before assigning a series number.");
  return value as PublicationMetadata;
}
