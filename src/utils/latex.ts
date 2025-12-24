/**
 * LaTeX Preprocessing Utility for LLM Output
 * 
 * This utility provides robust parsing for mixed Markdown/LaTeX content.
 * It strictly separates "Text" from "Math" using a linear scanning approach
 * similar to KaTeX's auto-render extension.
 * 
 * Goals:
 * 1. Prevent double-wrapping of already wrapped math.
 * 2. Handle standard LaTeX delimiters: $$...$$, \[...\], \(...\).
 * 3. Handle bare LaTeX environments: \begin{...}...\end{...}.
 * 4. Normalize all display math to use $$ delimiters with newlines for safe Remark parsing.
 */

interface Delimiter {
  left: string;
  right: string;
  display: boolean;
}

// Standard delimiters to look for
const DELIMITERS: Delimiter[] = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  // We don't blindly support single $ because it causes too many false positives with currency.
  // We rely on \(...\) or specific handling closer to where it's needed if strict $ support is asked.
];

// Environments that should be treated as display math (block level)
// This list covers most common math environments used by LLMs.
const DISPLAY_ENVIRONMENTS = [
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "Vmatrix",
  "cases",
  "theorem",
  "lemma",
  "proof",
];

export function preprocessLaTeX(content: string): string {
  if (!content) return "";

  let result = "";
  let i = 0;
  const len = content.length;

  while (i < len) {
    // 1. Check for specific delimiters (Highest Priority - explicitly wrapped math)
    let foundDelimiter: Delimiter | null = null;
    let endDelimiterPos = -1;

    for (const delim of DELIMITERS) {
      if (content.startsWith(delim.left, i)) {
        // Find closing delimiter
        const potentialEnd = content.indexOf(delim.right, i + delim.left.length);
        if (potentialEnd !== -1) {
            foundDelimiter = delim;
            endDelimiterPos = potentialEnd;
            break;
        }
      }
    }

    if (foundDelimiter && endDelimiterPos !== -1) {
      const mathContent = content.substring(i + foundDelimiter.left.length, endDelimiterPos);
      
      if (foundDelimiter.display) {
        // Normalize display math to $$ wrapped with newlines
        // We trim the content to avoid extra internal newlines
        result += `\n$$\n${mathContent.trim()}\n$$\n`;
      } else {
        // Normalize inline math to $ wrapped
        result += `$${mathContent.trim()}$`;
      }
      
      i = endDelimiterPos + foundDelimiter.right.length;
      continue;
    }

    // 2. Check for \begin{...} environments (Bare LaTeX)
    // This is essentially "auto-render" logic for environments.
    if (content.startsWith("\\begin", i)) {
      // Extract environment name. Regex is safer here for local matching.
      const match = content.slice(i).match(/^\\begin\s*\{([a-zA-Z0-9*]+)\}/);
      if (match) {
        const envName = match[1];
        const fullMatch = match[0]; // e.g. "\begin{equation}"
        
        // Find corresponding \end{...}
        // Find corresponding \end{...}
        // We need to handle nested environments of the same name.
        const searchPos = i + fullMatch.length;
        
        // Naive linear search for balanced \begin and \end tags for this specific environment
        const beginRegex = new RegExp(`\\\\begin\\s*\\{${escapeRegExp(envName)}\\}`, 'g');
        const endRegex = new RegExp(`\\\\end\\s*\\{${escapeRegExp(envName)}\\}`, 'g');
        
        // We search forward to find the matching boolean end
        // A simple indexOf loop is sufficient and faster than repeated regex
        while (searchPos < len) {
           // Check for next instance of \begin{envName} or \end{envName}
           // To be correct, we need to find the specific next tag.
           // Since JS regex isn't "stateful" in this linear scan easily, we can just scan for the closing tag 
           // and verify nesting if we wanted to be 100% perfect, but strict nesting checks are expensive.
           // Simplified approach: Find the next \end{envName}
           
           // However, if we just find next \end without counting \begins, we break for nested matrices:
           // \begin{pmatrix} \begin{pmatrix} a \end{pmatrix} \end{pmatrix}
           
           // Optimized local search:
           const nextEnd = content.substr(searchPos).match(endRegex);
           if (!nextEnd || nextEnd.index === undefined) break;
           
           const relativeEndIndex = nextEnd.index;
           const absoluteEndIndex = searchPos + relativeEndIndex;
           
           // Check if there are any \begins in between current pos and this \end
           const substringInvalid = content.substring(searchPos, absoluteEndIndex);
           const nestedBegins = (substringInvalid.match(beginRegex) || []).length;
           
           if (nestedBegins > 0) {
             // We found more opens before this close.
             // We need to skip this many 'ends' effectively, or better:
             // We just found N opens. We effectively need to find N+1 closes total from start.
             // This scan approach is tricky.
             
             // Let's rely on a simpler "find balanced brace" assumption which works for 99% of LLM output:
             // Just find the matching \end tag. If complex nesting exists, existing parsers often fail too.
             // But let's try to be decent.
             
             // Actually, for LLM output, regex matching with '[\s\S]*?' is usually risky if greedy.
             // Let's stick to: Find first \end{envName}. If user generated valid LaTeX, it's matched.
             // If nested same-type environments exist, this naive split might take the inner one.
             // BUT, valid LaTeX rarely nests same-named environments directly without grouping. 
             // Exception: matrix in matrix? Rare for LLM to output unescaped.
             
             // Let's use the simplest robust logic: Find the closing tag.
             // If we really want to support nested \begin{matrix}...\begin{matrix}...\end{matrix}...\end{matrix},
             // we need a counter.
             
             let currentDepth = 1;
             const scanCursor = searchPos;
             
             // Regex for either begin or end tag of this type
             const tagRegex = new RegExp(`\\\\(begin|end)\\s*\\{${escapeRegExp(envName)}\\}`, 'g');
             tagRegex.lastIndex = scanCursor;
             
             let tagMatch;
             let closeIndex = -1;
             let fullCloseTagLength = 0;
             
             while ((tagMatch = tagRegex.exec(content)) !== null) {
                if (tagMatch[1] === 'begin') {
                  currentDepth++;
                } else {
                  currentDepth--;
                }
                
                if (currentDepth === 0) {
                    closeIndex = tagMatch.index;
                    fullCloseTagLength = tagMatch[0].length;
                    break;
                }
             }
             
             if (closeIndex !== -1) {
                 const fullBlock = content.substring(i, closeIndex + fullCloseTagLength);
                 
                 // If the environment is a known display environment, wrap it.
                 // Even if unknown, if it's a \begin block at top level text, usually better safe to wrap
                 // to prevent Remark from eating special chars.
                 // But let's be strict: only wrap math environments.
                 
                 // Check if it's a math environment
                 const isMath = DISPLAY_ENVIRONMENTS.includes(envName);
                 
                 if (isMath) {
                     result += `\n$$\n${fullBlock}\n$$\n`;
                 } else {
                     // Could be a diagram or table (tabular). Leave as is or handle specifically?
                     // LaTeX tabular usually works better as is if remarks plugins match it, 
                     // but remark-math generally ignores tabular.
                     result += fullBlock;
                 }
                 
                 i = closeIndex + fullCloseTagLength;
                 continue; // Continue main loop
             }
           }
           
           break; // Stop trying to handle this begin if we couldn't handle nesting logic above
        }
      }
    }

    // 3. Just text
    result += content[i];
    i++;
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
