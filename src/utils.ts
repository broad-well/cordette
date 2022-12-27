export function stripMarkdown (s: string): string {
  return s.replace(/(\*|_|~|`|\[|\]|\(|\)|\||\\)/g, '\\$1').replace(/\s+/g, ' ')
}

export function stripMarkdownTag (
  strings: TemplateStringsArray,
  ...expr: unknown[]
) {
  return strings.reduce(
    (acc, s, i) =>
      acc + s + (i < expr.length ? stripMarkdown(String(expr[i])) : ''),
    ''
  )
}
