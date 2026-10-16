/**
 * Wraps a value that is dropped into a sentence (a website address, a business name) in Unicode
 * isolation marks, so a Latin name inside Hebrew text keeps its own direction and does not pull
 * the neighbouring punctuation or words out of order.
 */
export function isolate(value: string): string {
  return `⁨${value}⁩`;
}
