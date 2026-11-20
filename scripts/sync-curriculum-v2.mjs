#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const TRACK_CONFIG = {
  java: {
    trackLabel: 'Java',
    idPrefix: 'java-v2-ch',
    qPrefix: 'java-v2-ch',
    mdPath: path.join(REPO_ROOT, 'docs', 'curriculum', 'Giao_Trinh_Java_Microservices.md'),
  },
  csharp: {
    trackLabel: 'C#',
    idPrefix: 'csharp-v2-ch',
    qPrefix: 'csharp-v2-ch',
    mdPath: path.join(REPO_ROOT, 'docs', 'curriculum', 'Giao_Trinh_Csharp_Microservices.md'),
  },
};

const TARGET_JSON_PATH = path.join(
  REPO_ROOT,
  'MAVIS-Platform',
  'mavis-be',
  'mavis-platform',
  'src',
  'main',
  'resources',
  'curriculum',
  'java-csharp-v1.json',
);

const SOURCE_LIBRARY = {
  R19: {
    publisher: 'Manning / Microservices.io',
    title: 'Chris Richardson — Microservices Patterns',
    url: 'https://microservices.io/patterns/',
  },
  S16: {
    publisher: 'Spring Cloud',
    title: 'Mastering Microservices with Java & Spring Cloud Reference',
    url: 'https://docs.spring.io/spring-cloud/reference/',
  },
  F16: {
    publisher: "O'Reilly / Production-Ready Microservices",
    title: 'Susan J. Fowler — Production-Ready Microservices',
    url: 'https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/',
  },
  MS24: {
    publisher: 'Microsoft Learn',
    title: '.NET Microservices: Architecture for Containerized .NET Applications',
    url: 'https://learn.microsoft.com/en-us/dotnet/architecture/microservices/',
  },
  STD_JAVA: {
    publisher: 'Spring & Oracle Java 21',
    title: 'Spring Boot 3 & Java 21 Official Documentation',
    url: 'https://docs.spring.io/spring-boot/reference/',
  },
  STD_CSHARP: {
    publisher: 'Microsoft Learn (.NET 8 / YARP)',
    title: 'ASP.NET Core 8 & YARP Reverse Proxy Documentation',
    url: 'https://learn.microsoft.com/en-us/aspnet/core/',
  },
  C4: {
    publisher: 'Simon Brown',
    title: 'The C4 Model for Visualising Software Architecture',
    url: 'https://c4model.com/',
  },
  OTEL: {
    publisher: 'CNCF OpenTelemetry',
    title: 'OpenTelemetry Concepts & Instrumentation Docs',
    url: 'https://opentelemetry.io/docs/',
  },
  MAVIS: {
    publisher: 'MAVIS Platform Specification',
    title: 'MAVIS Architecture Analysis & Cycle-Safe Reverse BFS Spec',
    url: 'https://c4model.com/',
  },
};

function parseArgs(argv) {
  let track = null;
  let chapter = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--track' && argv[i + 1]) {
      track = argv[++i].toLowerCase();
    } else if (argv[i] === '--chapter' && argv[i + 1]) {
      chapter = Number.parseInt(argv[++i], 10);
    }
  }
  if (!track || !TRACK_CONFIG[track]) {
    throw new Error(`Invalid or missing --track <java|csharp>. Received: ${track}`);
  }
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 12) {
    throw new Error(`Invalid or missing --chapter <1..12>. Received: ${chapter}`);
  }
  return { track, chapter };
}

function resolveSources(track, rawSourcesLine, chapterTitle) {
  const sources = [];
  const addUnique = (entry) => {
    if (!sources.some((s) => s.url === entry.url)) {
      sources.push(entry);
    }
  };

  if (/\[R19\]/i.test(rawSourcesLine)) addUnique(SOURCE_LIBRARY.R19);
  if (/\[MS24\]/i.test(rawSourcesLine)) addUnique(SOURCE_LIBRARY.MS24);
  if (/\[S16\]/i.test(rawSourcesLine)) addUnique(SOURCE_LIBRARY.S16);
  if (/\[F16\]/i.test(rawSourcesLine)) addUnique(SOURCE_LIBRARY.F16);
  if (/OpenTelemetry/i.test(rawSourcesLine + ' ' + chapterTitle)) addUnique(SOURCE_LIBRARY.OTEL);
  if (/C4/i.test(rawSourcesLine + ' ' + chapterTitle)) addUnique(SOURCE_LIBRARY.C4);
  if (/\[STD\]/i.test(rawSourcesLine)) {
    addUnique(track === 'java' ? SOURCE_LIBRARY.STD_JAVA : SOURCE_LIBRARY.STD_CSHARP);
  }
  if (sources.length === 0) {
    addUnique(track === 'java' ? SOURCE_LIBRARY.STD_JAVA : SOURCE_LIBRARY.MS24);
  }
  return sources;
}

function convertLatexExprToUnicode(expr) {
  let out = expr.trim();
  const supMap = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const subMap = { i: 'ᵢ', n: 'ₙ' };

  out = out
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\prod_\{([^}]*)\}\^\{([^}]*)\}/g, '∏($1..$2)')
    .replace(/\\prod/g, '∏')
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\dots\b/g, '…')
    .replace(/\\%/g, '%')
    .replace(/\^\{([0-9]+)\}/g, (_, d) => [...d].map((c) => supMap[c] || c).join(''))
    .replace(/\^([0-9])/g, (_, d) => supMap[d] || `^${d}`)
    .replace(/_\{([a-zA-Z0-9_-]+)\}/g, '_$1')
    .replace(/_([in])\b/g, (_, s) => subMap[s] || `_${s}`)
    .replace(/[ \t]+/g, ' ');
  return out.trim();
}

function sanitizeLatexMarkdown(markdown) {
  if (!markdown) return markdown;
  const preserved = [];
  const mask = (segment) => {
    const token = `\u0000CODE${preserved.length}\u0000`;
    preserved.push(segment);
    return token;
  };

  let text = markdown.replace(/```[\s\S]*?```/g, mask).replace(/`[^`\n]+`/g, mask);

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => convertLatexExprToUnicode(inner));
  text = text.replace(/\$(?!\{)(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, inner) => convertLatexExprToUnicode(inner));

  text = text
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']');

  return text.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => preserved[Number(idx)]);
}

function cleanObjective(rawObjectiveBlock) {
  const lines = rawObjectiveBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').replace(/\*\*/g, ''));
  return sanitizeLatexMarkdown(lines.join(' '));
}

function estimateMinutes(chapterNumber, lessonBody) {
  if (chapterNumber === 12) return 60;
  if (lessonBody.length >= 9000) return 55;
  if (lessonBody.length >= 6500) return 50;
  return 45;
}

function sanitizeQuizPlainText(rawText, { stripLeadingNumber = false } = {}) {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // Convert any math notation inside quiz text to Unicode before stripping code ticks.
  text = text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => convertLatexExprToUnicode(inner))
    .replace(/\$(?!\{)(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, inner) => convertLatexExprToUnicode(inner))
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈');

  // Unescape markdown brackets and strip inline markdown bold/italic/code wrappers.
  text = text
    .replace(/\\([\[\]*_`])/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:?!]|$)/g, '$1$2')
    .replace(/\*\*|`/g, '');

  if (stripLeadingNumber) {
    text = text.replace(/^\s*(?:Câu\s*\d+(?:\.\d+)?[:.\s-]*|\d+[.)]\s+)/i, '');
  }

  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseQuestions(quizSection, qIdPrefix) {
  let cleanQuiz = quizSection;
  const stopIdx = cleanQuiz.search(/^(?:---|\s*#\s+(?:🏛️|🌐|🗄️|🛡️|🚀|📎))/m);
  if (stopIdx !== -1) {
    cleanQuiz = cleanQuiz.slice(0, stopIdx);
  }

  const blocks = cleanQuiz
    .split(/(?=^\*\*Câu\s+[\d.]+\*\*)/m)
    .filter((b) => /^\*\*Câu\s+[\d.]+\*\*/.test(b.trim()));

  if (blocks.length !== 4) {
    throw new Error(`Expected 4 quiz questions for ${qIdPrefix}, found ${blocks.length}`);
  }

  const letters = ['A', 'B', 'C', 'D'];
  return blocks.map((block, idx) => {
    const promptMatch = block.match(/^\*\*Câu\s+[\d.]+\*\*:\s*([^\r\n]+)/);
    if (!promptMatch) {
      throw new Error(`Missing question prompt for ${qIdPrefix}-q${idx + 1}`);
    }
    const prompt = sanitizeQuizPlainText(promptMatch[1], { stripLeadingNumber: true });

    const optMatches = [...block.matchAll(/^\s*[-*]\s*([A-D])\.\s+(.+)$/gm)];
    if (optMatches.length !== 4) {
      throw new Error(`Expected 4 options for ${qIdPrefix}-q${idx + 1}, found ${optMatches.length}`);
    }
    const options = optMatches.map((m, optIdx) => {
      if (m[1] !== letters[optIdx]) {
        throw new Error(`Out-of-order option ${m[1]} at ${qIdPrefix}-q${idx + 1}`);
      }
      return sanitizeQuizPlainText(m[2]);
    });

    const ansMatch = block.match(/\*\*Đáp án đúng:\s*([A-D])\.?\*\*\s*(?:\*Giải thích\*:\s*([\s\S]*))?/i);
    if (!ansMatch) {
      throw new Error(`Missing correct answer for ${qIdPrefix}-q${idx + 1}`);
    }
    const correctOption = letters.indexOf(ansMatch[1].toUpperCase());
    if (correctOption < 0 || correctOption >= options.length) {
      throw new Error(`Invalid correctOption index for ${qIdPrefix}-q${idx + 1}`);
    }
    const explanation = sanitizeQuizPlainText(ansMatch[2] || '');
    if (!explanation) {
      throw new Error(`Blank explanation for ${qIdPrefix}-q${idx + 1}`);
    }

    return {
      id: `${qIdPrefix}-q${idx + 1}`,
      prompt,
      type: 'SINGLE_CHOICE',
      options,
      correctOption,
      explanation,
      points: 1,
    };
  });
}

function parseChapter(track, chapterNumber) {
  const cfg = TRACK_CONFIG[track];
  const rawMd = fs.readFileSync(cfg.mdPath, 'utf8').replace(/^\uFEFF/, '');
  const chapterSplits = rawMd.split(/(?=^## CHƯƠNG \d+:)/m).slice(1);
  if (chapterSplits.length !== 12) {
    throw new Error(`Expected 12 chapters in ${cfg.mdPath}, found ${chapterSplits.length}`);
  }

  let section = chapterSplits[chapterNumber - 1];
  // For Chapter 12, strip trailing Appendices starting with "# 📎 PHỤ LỤC" or top-level Module divider "---"
  const appendixIdx = section.search(/^#\s+📎\s*PHỤ LỤC/m);
  if (appendixIdx !== -1) {
    section = section.slice(0, appendixIdx);
  }
  const nextModuleIdx = section.search(/^#\s+(?:🏛️|🌐|🗄️|🛡️|🚀)\s*MODULE/m);
  if (nextModuleIdx !== -1) {
    section = section.slice(0, nextModuleIdx);
  }

  const headingMatch = section.match(/^## CHƯƠNG (\d+):\s*([^\r\n]+)/);
  if (!headingMatch) {
    throw new Error(`Missing chapter heading for ${track} chapter ${chapterNumber}`);
  }
  const parsedNum = Number.parseInt(headingMatch[1], 10);
  if (parsedNum !== chapterNumber) {
    throw new Error(`Expected chapter ${chapterNumber}, got ${parsedNum}`);
  }

  const codeMatch = section.match(/\*\*Mã chương\*\*:\s*`([^`]+)`\s*\|\s*\*\*Học phần\*\*:\s*([^\r\n]+)/);
  if (!codeMatch) {
    throw new Error(`Missing metadata line for ${track} chapter ${chapterNumber}`);
  }
  const moduleLabel = codeMatch[2].trim();

  const srcMatch = section.match(/\*\*Nguồn chuẩn\*\*:\s*([^\r\n]+)/);
  if (!srcMatch) {
    throw new Error(`Missing sources line for ${track} chapter ${chapterNumber}`);
  }

  const objMatch = section.match(/\*\*Mục tiêu học tập\*\*:\s*\r?\n([\s\S]*?)(?=\r?\n###\s)/);
  if (!objMatch) {
    throw new Error(`Missing learning objectives for ${track} chapter ${chapterNumber}`);
  }

  const labMatch = section.match(/^###\s+[\d.]+\s*Bài tập thực hành Lab[^\r\n]*/m);
  const quizMatch = section.match(/^###\s+[\d.]+\s*Ngân hàng Quiz Gate[^\r\n]*/m);
  if (!labMatch || !quizMatch || quizMatch.index <= labMatch.index) {
    throw new Error(`Invalid Lab/Quiz sections for ${track} chapter ${chapterNumber}`);
  }

  const lessonStart = section.search(/^###\s+\d+\.\d+/m);
  const lessonBody = sanitizeLatexMarkdown(section.slice(lessonStart, labMatch.index).trim());
  const exerciseBody = sanitizeLatexMarkdown(section.slice(labMatch.index, quizMatch.index).trim());
  const quizSection = section.slice(quizMatch.index).trim();

  if (lessonBody.length < 400) {
    throw new Error(`Lesson markdown unexpectedly short (${lessonBody.length} chars) for ${track} ch${chapterNumber}`);
  }
  if (exerciseBody.length < 60) {
    throw new Error(`Exercise markdown unexpectedly short (${exerciseBody.length} chars) for ${track} ch${chapterNumber}`);
  }

  const chPadded = String(chapterNumber).padStart(2, '0');
  const chapterId = `${cfg.idPrefix}${chPadded}`;
  const cleanTitle = sanitizeLatexMarkdown(`Chương ${chPadded}: ${headingMatch[2].trim()}`);
  const objective = cleanObjective(objMatch[1]);
  const sources = resolveSources(track, srcMatch[1], cleanTitle);
  const questions = parseQuestions(quizSection, chapterId);

  return {
    id: chapterId,
    track: cfg.trackLabel,
    phase: `V2 · ${moduleLabel}`,
    title: cleanTitle,
    minutes: estimateMinutes(chapterNumber, lessonBody),
    objective,
    lesson: lessonBody,
    exercise: exerciseBody,
    sources,
    questions,
  };
}

function upsertCurriculumEntry(entry) {
  const rawJson = fs.readFileSync(TARGET_JSON_PATH, 'utf8');
  const existing = JSON.parse(rawJson);
  if (!Array.isArray(existing)) {
    throw new Error('Existing curriculum JSON must be an array');
  }
  const idx = existing.findIndex((item) => item && item.id === entry.id);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  fs.writeFileSync(TARGET_JSON_PATH, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return { total: existing.length, replaced: idx >= 0 };
}

function main() {
  const { track, chapter } = parseArgs(process.argv.slice(2));
  const entry = parseChapter(track, chapter);
  const res = upsertCurriculumEntry(entry);
  console.log(
    `[sync-curriculum-v2] ${res.replaced ? 'Updated' : 'Inserted'} ${entry.id} (${entry.track}, ${entry.questions.length} questions, ${entry.lesson.length} chars lesson) -> total chapters: ${res.total}`,
  );
}

main();
