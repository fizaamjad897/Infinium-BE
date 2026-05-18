const PythonAgentService = require('./pythonAgent.service');

// Mermaid diagram-type declarations we recognize. Order matters: longer / more
// specific keywords first so we don't match a prefix of a longer keyword.
const DIAGRAM_TYPES = [
  'stateDiagram-v2',
  'architecture-beta',
  'requirementDiagram',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
  'classDiagram',
  'sequenceDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'flowchart',
  'graph'
];

// Reserved words that break mermaid when used as bare node IDs in flowchart
// / graph diagrams. We intentionally exclude diagram-type keywords like
// `flowchart` and `graph` because they appear on the header line and must
// not be rewritten.
const RESERVED_NODE_IDS = new Set(['end', 'default']);

class DiagramService {

  // Prompts for different diagram types. We are very explicit about syntax
  // constraints because the LLM tends to produce labels with unquoted special
  // characters, reserved-word node IDs, or trailing prose — all of which make
  // the diagram fail to render on the frontend.
  static getPrompts() {
    const commonRules = `
STRICT OUTPUT RULES (these are mandatory — breaking any rule will cause the diagram to fail to render):
1. Return ONLY the Mermaid diagram code. NO prose, NO explanations, NO headings before or after.
2. Do NOT wrap the diagram in markdown code fences (no \`\`\`mermaid, no \`\`\`).
3. Node IDs MUST be alphanumeric only (A-Z, a-z, 0-9, underscore). NO spaces, NO hyphens, NO dots, NO slashes in IDs.
4. Node IDs MUST NOT be reserved words: end, class, subgraph, default, click, style, graph, flowchart, state, note, direction.
5. ALWAYS wrap node labels in double quotes when they contain ANY of: spaces, parentheses ( ), brackets [ ], braces { }, colons :, commas ,, semicolons ;, slashes /, backslashes, quotes, ampersands &, less-than <, greater-than >, hash #, pipe |. Example: A["src/utils/helpers.js"] not A[src/utils/helpers.js].
6. Inside a quoted label, do NOT use double quotes. Use single quotes or remove them.
7. Keep labels short — under 40 characters. Truncate long file paths.
8. Use ONLY ASCII characters. No emoji, no unicode arrows, no smart quotes.
9. Edge labels with special characters must also be quoted: A -->|"some label"| B.
10. Do not include comments (no %% lines unless strictly necessary).`;

    return {
      flowchart: (repoName) => `Generate a Mermaid flowchart showing the architecture and module structure of the "${repoName}" repository.
Include main directories, key files, and their relationships.
${commonRules}

Begin your response with the line: flowchart TD
Example of CORRECT output:
flowchart TD
    A["Main Entry"] --> B["Module 1"]
    B --> C["Module 2"]
    C --> D[("Database")]`,

      class: (repoName) => `Generate a Mermaid class diagram showing the main classes and their relationships in the "${repoName}" repository.
Include inheritance (--|>), composition (*--), and key methods.
${commonRules}

Begin your response with the line: classDiagram
Example of CORRECT output:
classDiagram
    class User {
        +String id
        +String email
        +login()
    }
    class Repository {
        +String name
        +index()
    }
    User --> Repository`,

      sequence: (repoName) => `Generate a Mermaid sequence diagram showing the main API flow in the "${repoName}" repository.
Show how different components communicate.
${commonRules}

Begin your response with the line: sequenceDiagram
Example of CORRECT output:
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    User->>Frontend: Click button
    Frontend->>Backend: API call
    Backend-->>Frontend: Response`,

      component: (repoName) => `Generate a Mermaid component diagram showing the high-level architecture of the "${repoName}" repository.
Show major components and their dependencies using subgraphs.
${commonRules}

Begin your response with the line: graph LR
Example of CORRECT output:
graph LR
    subgraph Frontend
        A["UI Components"]
    end
    subgraph Backend
        B["API Server"]
        C[("Database")]
    end
    A --> B
    B --> C`,

      architecture: (repoName) => `Generate a comprehensive Mermaid flowchart for the architecture of the "${repoName}" repository.
Include all major components, their relationships, data flow, and external integrations.
${commonRules}

Begin your response with the line: flowchart TD`
    };
  }

  /**
   * Find the first occurrence of a Mermaid diagram-type keyword in the text
   * and return its index along with the matched keyword. Returns null if none
   * found.
   */
  static findDiagramStart(text) {
    let bestIdx = -1;
    let bestKeyword = null;
    for (const kw of DIAGRAM_TYPES) {
      // Match the keyword at start of a line (or start of text), optionally
      // preceded by whitespace, followed by whitespace, newline, or EOF.
      const re = new RegExp(`(^|\\n)\\s*(${kw})(\\s|$)`, 'm');
      const m = text.match(re);
      if (m) {
        // m.index points at the start of the whole match (which may be a
        // newline). The keyword itself starts at m.index + m[0].indexOf(kw).
        const idx = m.index + m[0].indexOf(kw);
        if (bestIdx === -1 || idx < bestIdx) {
          bestIdx = idx;
          bestKeyword = kw;
        }
      }
    }
    if (bestIdx === -1) return null;
    return { index: bestIdx, keyword: bestKeyword };
  }

  /**
   * Strip lines after the diagram that are clearly prose / explanation (the
   * LLM often appends "This diagram shows ..." after the code). We treat the
   * diagram as ending when we hit a long sentence-like line of plain text
   * that doesn't look like mermaid syntax.
   */
  static stripTrailingProse(code) {
    const lines = code.split('\n');
    const mermaidLineHint = /(-->|---|==>|\.->|::|\bclass\b|\bsubgraph\b|\bend\b|\bparticipant\b|\bnote\b|\[|\]|\{|\}|\(|\)|->|\|)/;
    let lastGoodIdx = lines.length - 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line === '') continue;
      // If it looks like mermaid syntax, stop trimming.
      if (mermaidLineHint.test(line)) {
        lastGoodIdx = i;
        break;
      }
      // Otherwise it's likely prose — drop it.
      lastGoodIdx = i - 1;
    }
    return lines.slice(0, lastGoodIdx + 1).join('\n');
  }

  /**
   * Quote any unquoted bracketed label that contains characters mermaid
   * cannot parse raw (parens, colons, slashes, etc.). Handles [...], (...),
   * and {...} shapes commonly used in flowcharts.
   */
  static quoteRiskyLabels(code) {
    // Characters that, when present in a label, require the label to be
    // wrapped in double quotes for mermaid to parse it reliably.
    const needsQuote = /[()/\\:,;&<>#|"']/;

    // Match a node-shape opener followed by its content up to the matching
    // closer. We handle [], (), {} on a per-line basis (mermaid labels don't
    // span lines). We avoid touching already-quoted labels.
    const transformLine = (line) => {
      // Skip lines that are clearly directives, not nodes.
      const trimmed = line.trim();
      if (
        trimmed.startsWith('%%') ||
        trimmed.startsWith('classDef') ||
        trimmed.startsWith('style ') ||
        trimmed.startsWith('linkStyle') ||
        trimmed.startsWith('click ')
      ) {
        return line;
      }

      // For each shape, replace [content] / (content) / {content} where the
      // content is not already quoted and contains risky chars.
      const shapes = [
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '{', close: '}' }
      ];

      let out = '';
      let i = 0;
      while (i < line.length) {
        const ch = line[i];
        const shape = shapes.find((s) => s.open === ch);
        if (!shape) {
          out += ch;
          i++;
          continue;
        }
        // Find the matching closer on the same line. Track nesting of the
        // same opener so we get the outermost close.
        let depth = 1;
        let j = i + 1;
        while (j < line.length && depth > 0) {
          if (line[j] === shape.open) depth++;
          else if (line[j] === shape.close) depth--;
          if (depth === 0) break;
          j++;
        }
        if (j >= line.length || depth !== 0) {
          // Unbalanced; leave as-is.
          out += line.slice(i);
          break;
        }
        const inner = line.slice(i + 1, j);
        const innerTrim = inner.trim();
        const alreadyQuoted =
          innerTrim.startsWith('"') && innerTrim.endsWith('"') && innerTrim.length >= 2;

        if (!alreadyQuoted && needsQuote.test(inner)) {
          // Replace any internal double quotes with single quotes so we can
          // safely wrap.
          const safe = inner.replace(/"/g, "'");
          out += shape.open + '"' + safe + '"' + shape.close;
        } else {
          out += shape.open + inner + shape.close;
        }
        i = j + 1;
      }
      return out;
    };

    return code.split('\n').map(transformLine).join('\n');
  }

  /**
   * Replace reserved-word node IDs (e.g. `end`, `class`) when they appear as
   * a bare identifier on a connection line. We rewrite `end` -> `endNode`,
   * `class` -> `classNode`, etc. Only applied to flowchart/graph diagrams
   * because in classDiagram / stateDiagram these words are legitimate.
   */
  static fixReservedNodeIds(code, diagramType) {
    if (!['flowchart', 'graph'].includes(diagramType)) return code;

    // Note: `end` is intentionally NOT in this list. Standalone `end` (the
    // subgraph closer) is handled by the explicit `trimmed === 'end'` check
    // / lacks a shape opener so it can't be mis-rewritten; but `end --> X`
    // SHOULD have `end` renamed as a node id.
    const directivePrefix = /^\s*(subgraph|direction|style|linkStyle|classDef|class|click|state|note)\b/;
    const lines = code.split('\n');
    const out = lines.map((line, idx) => {
      // Skip the header line (e.g. "flowchart TD") so we never rewrite the
      // diagram-type declaration.
      if (idx === 0) return line;

      // Skip mermaid directive lines.
      if (directivePrefix.test(line)) return line;

      // Don't touch the `end` that closes a subgraph — that's on its own line.
      const trimmed = line.trim();
      if (trimmed === 'end') return line;

      let result = line;
      for (const word of RESERVED_NODE_IDS) {
        // Rewrite when the reserved word appears as a bare identifier — i.e.
        // bordered by start-of-line / whitespace / connector chars on the
        // left, and shape openers / whitespace / connectors / end-of-line on
        // the right.
        const re = new RegExp(`(^|[\\s>|-])${word}(?=$|[\\s\\[\\(\\{>|.-])`, 'g');
        result = result.replace(re, (m, pre) => `${pre}${word}Node`);
      }
      return result;
    });
    return out.join('\n');
  }

  /**
   * Replace spaces and other illegal characters in bare node IDs. We
   * approximate "node ID" as an identifier that appears immediately before a
   * shape opener `[`, `(`, `{`, or before/after an arrow.
   */
  static fixNodeIdWhitespace(code) {
    // Replace patterns like `My Node[...]` with `My_Node[...]`. Must be
    // quote-aware: never touch content inside a "..." label, since that's
    // user-facing display text. We split each line into alternating
    // outside-quote / inside-quote segments and only rewrite the outside
    // ones.
    //
    // Also skip lines that begin with a mermaid directive keyword
    // (`subgraph`, `style`, `class`, etc.) — those keywords are followed by
    // an identifier + optional `[label]`, and rewriting the space between
    // would turn `subgraph Routes [...]` into `subgraph_Routes_[...]`,
    // which mermaid parses as a node id and fails on the matching `end`.
    // Note: `end` is intentionally NOT in this list. Standalone `end` (the
    // subgraph closer) is handled by the explicit `trimmed === 'end'` check
    // / lacks a shape opener so it can't be mis-rewritten; but `end --> X`
    // SHOULD have `end` renamed as a node id.
    const directivePrefix = /^\s*(subgraph|direction|style|linkStyle|classDef|class|click|state|note)\b/;
    const lines = code.split('\n');
    const fixed = lines.map((line) => {
      if (directivePrefix.test(line)) return line;
      const segments = line.split('"');
      // Even indices are outside double-quoted regions; odd indices are
      // inside them.
      for (let i = 0; i < segments.length; i += 2) {
        segments[i] = segments[i].replace(
          /([A-Za-z][A-Za-z0-9 _-]*?)([\[\(\{])/g,
          (m, id, opener) => {
            const leading = id.match(/^\s*/)[0];
            const body = id.slice(leading.length);
            if (!/[ -]/.test(body)) return m;
            const safe = body.replace(/[ -]+/g, '_');
            return `${leading}${safe}${opener}`;
          }
        );
      }
      return segments.join('"');
    });
    return fixed.join('\n');
  }

  /**
   * Strip leading content before the diagram type declaration and any code
   * fence markers throughout the text.
   */
  static stripFencesAndPreamble(raw) {
    let text = raw || '';
    // Remove all fenced code markers.
    text = text.replace(/```[a-zA-Z]*\n?/g, '');
    text = text.replace(/```/g, '');
    // Sometimes the LLM emits a bare "mermaid" label on its own line.
    text = text.replace(/^\s*mermaid\s*$/gim, '');
    return text;
  }

  /**
   * Normalize characters that mermaid 11.x parses strictly: BOM, smart
   * quotes, unicode dashes/arrows, zero-width spaces, CRLF endings, and
   * trailing whitespace on each line. Without this, LLM output that "looks
   * fine" can fail with cryptic lexical errors.
   */
  static normalizeUnicode(text) {
    if (!text) return text;
    let out = text;
    // Strip BOM and zero-width characters.
    out = out.replace(/^﻿/, '');
    out = out.replace(/[​-‍﻿]/g, '');
    // Normalize line endings.
    out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Smart quotes → ASCII quotes.
    out = out.replace(/[‘’‚′]/g, "'");
    out = out.replace(/[“”„″]/g, '"');
    // En/em dashes and minus → ASCII hyphen.
    out = out.replace(/[–—−]/g, '-');
    // Unicode arrows → ASCII equivalents.
    out = out.replace(/[→➡➔]/g, '->');
    out = out.replace(/[←]/g, '<-');
    // Non-breaking space → regular space.
    out = out.replace(/ /g, ' ');
    // Strip trailing whitespace per line.
    out = out.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
    return out;
  }

  /**
   * Validate the final code looks parseable. Returns true if it starts with
   * a recognized diagram type and contains at least one non-header line.
   */
  static isLikelyValid(code) {
    if (!code || typeof code !== 'string') return false;
    const firstLine = code.split('\n').find((l) => l.trim().length > 0);
    if (!firstLine) return false;
    const head = firstLine.trim().split(/\s+/)[0];
    if (!DIAGRAM_TYPES.includes(head)) return false;
    // Need at least one body line.
    const body = code.split('\n').slice(1).filter((l) => l.trim().length > 0);
    return body.length > 0;
  }

  /**
   * Full clean + sanitize pipeline. Always returns a string that mermaid can
   * attempt to render; falls back to a minimal placeholder diagram if the
   * input is unsalvageable.
   */
  static sanitizeMermaidCode(raw, requestedType = 'flowchart') {
    const fallback = `flowchart TD\n    A["Diagram unavailable"] --> B["Try regenerating"]`;

    if (!raw || typeof raw !== 'string') return fallback;

    // 1. Strip code fences and stray "mermaid" labels.
    let code = this.stripFencesAndPreamble(raw);

    // 2. Normalize unicode (smart quotes, unicode arrows, BOM, CRLF, etc.)
    // before any structural parsing — mermaid 11.x rejects these silently.
    code = this.normalizeUnicode(code);

    // 3. Find the diagram type declaration and slice from there. Strip any
    // residual leading whitespace so the header is guaranteed to be the
    // first line.
    const start = this.findDiagramStart(code);
    if (start) {
      code = code.slice(start.index).replace(/^\s+/, '');
    } else {
      // No recognized header — prepend a default one matching the request.
      const header = requestedType === 'class' ? 'classDiagram'
        : requestedType === 'sequence' ? 'sequenceDiagram'
        : requestedType === 'component' ? 'graph LR'
        : 'flowchart TD';
      code = `${header}\n${code}`;
    }

    // 4. Strip trailing prose ("This diagram shows ...").
    code = this.stripTrailingProse(code);

    // 5. Determine the diagram family for follow-up rules.
    const headerLine = code.split('\n')[0].trim();
    const diagramType = DIAGRAM_TYPES.find((t) => headerLine.startsWith(t)) || 'flowchart';

    // 6. Flowchart-family-only fixes. `quoteRiskyLabels` MUST NOT run on
    // classDiagram / stateDiagram / etc. because in those diagrams `{ }` is
    // class-body / state-body syntax, not a node-shape opener — wrapping
    // contents in quotes would break the parse.
    if (['flowchart', 'graph'].includes(diagramType)) {
      code = this.quoteRiskyLabels(code);
      code = this.fixNodeIdWhitespace(code);
      code = this.fixReservedNodeIds(code, diagramType);
    }

    // 7. Collapse excessive blank lines.
    code = code.replace(/\n{3,}/g, '\n\n').trim();

    // 8. Final validation; fall back if we still don't have a valid header.
    if (!this.isLikelyValid(code)) {
      console.warn('⚠️ Mermaid sanitization produced invalid output; using fallback.');
      return fallback;
    }
    return code;
  }

  static async generateDiagram(repoName, diagramType, branchFilter = null) {
    const prompts = this.getPrompts();
    const prompt = prompts[diagramType]?.(repoName) || prompts.flowchart(repoName);

    console.log(`📐 Generating ${diagramType} diagram for ${repoName}...`);

    const response = await PythonAgentService.queryRepo(
      repoName,
      prompt,
      null,
      branchFilter
    );

    const diagramCode = this.sanitizeMermaidCode(response.answer, diagramType);

    return {
      diagramCode,
      sources: response.sources,
      model: response.model
    };
  }
}

module.exports = DiagramService;
