/**
 * Pure JS zero-dependency PDF text extractor.
 * Parses stream operators of a PDF file to extract text sequences.
 */
export function parsePdfText(buf: Buffer): string {
  try {
    const text = buf.toString("binary");
    
    // Find TJ and Tj text blocks inside page content streams
    const matches = text.match(/\(([^)]+)\)\s*(Tj|TJ)/gi) || [];
    const chunks: string[] = [];
    
    for (const m of matches) {
      // Find the text within matching parenthesis
      const start = m.indexOf("(");
      const end = m.lastIndexOf(")");
      if (start === -1 || end === -1 || start >= end) continue;
      
      let inner = m.slice(start + 1, end);
      
      // Clean up PDF octal escapes \123 and general character escapes \n, \r, etc.
      inner = inner
        .replace(/\\([0-7]{3})/g, (_, oct) => {
          try {
            return String.fromCharCode(parseInt(oct, 8));
          } catch {
            return "";
          }
        })
        .replace(/\\n/gi, "\n")
        .replace(/\\r/gi, "\r")
        .replace(/\\t/gi, "\t")
        .replace(/\\(.)/g, "$1");
      
      chunks.push(inner);
    }
    
    // Merge, replace multi-spaces, and return clean plain text
    return chunks
      .join(" ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // remove non-printable control characters
      .replace(/\s+/g, " ")
      .trim();
  } catch (e) {
    console.error("[pdf-parser] Error extracting PDF text:", e);
    return "";
  }
}
