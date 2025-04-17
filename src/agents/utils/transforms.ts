/**
 * Transforms a string to a function-style name (lowercase, underscores)
 *
 * @param name The string to transform
 * @returns The transformed string suitable for a function name
 */
export function transformStringFunctionStyle(name: string): string {
  // Replace spaces with underscores
  name = name.replace(' ', '_');

  // Replace non-alphanumeric characters with underscores
  name = name.replace(/[^a-zA-Z0-9]/g, '_');

  return name.toLowerCase();
}
