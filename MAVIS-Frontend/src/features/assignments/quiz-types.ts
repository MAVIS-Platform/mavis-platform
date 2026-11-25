export type QuizQuestionType = "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE";

export type QuizQuestion = {
  id?: string;
  prompt: string;
  type: QuizQuestionType;
  options: string[];
  correctOption?: number | null;
  correctOptions?: number[] | null;
  explanation?: string;
  points?: number;
};

export type QuizDraft = {
  lesson: string;
  passPercent: number;
  questions: QuizQuestion[];
};

export const DEFAULT_PASS_PERCENT = 80;

export function emptyQuestion(type: QuizQuestionType = "SINGLE_CHOICE"): QuizQuestion {
  if (type === "TRUE_FALSE") {
    return { prompt: "", type, options: ["True", "False"], correctOption: 0, explanation: "", points: 1 };
  }
  if (type === "MULTI_CHOICE") {
    return {
      prompt: "",
      type,
      options: ["", "", ""],
      correctOptions: [0],
      explanation: "",
      points: 1,
    };
  }
  return { prompt: "", type, options: ["", ""], correctOption: 0, explanation: "", points: 1 };
}

export function questionErrors(question: QuizQuestion, index: number) {
  const errors: string[] = [];
  const prefix = `Question ${index + 1}`;
  if (!question.prompt?.trim()) errors.push(`${prefix}: prompt is required`);
  const options = question.options ?? [];
  if (options.length < 2 || options.length > 8) errors.push(`${prefix}: needs 2–8 options`);
  if (options.some((option) => !option?.trim())) errors.push(`${prefix}: options cannot be empty`);
  const type = question.type ?? "SINGLE_CHOICE";
  if (!["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"].includes(type)) errors.push(`${prefix}: unsupported type`);
  if (type === "TRUE_FALSE" && options.length !== 2) errors.push(`${prefix}: true/false needs exactly 2 options`);
  if (type === "MULTI_CHOICE") {
    const correct = question.correctOptions ?? [];
    if (!correct.length) errors.push(`${prefix}: choose at least one correct option`);
    if (new Set(correct).size !== correct.length) errors.push(`${prefix}: correct options contain duplicates`);
    if (correct.some((value) => !Number.isInteger(value) || value < 0 || value >= options.length))
      errors.push(`${prefix}: correct option is out of range`);
  } else if (
    question.correctOption === null ||
    question.correctOption === undefined ||
    !Number.isInteger(question.correctOption) ||
    question.correctOption < 0 ||
    question.correctOption >= options.length
  ) {
    errors.push(`${prefix}: choose one correct option`);
  }
  const points = question.points ?? 1;
  if (!Number.isInteger(points) || points < 1 || points > 100) errors.push(`${prefix}: points must be 1–100`);
  return errors;
}

export function quizErrors(draft: QuizDraft) {
  const errors: string[] = [];
  if (!draft.lesson?.trim()) errors.push("Lesson text is required");
  if (!Number.isInteger(draft.passPercent) || draft.passPercent < 1 || draft.passPercent > 100)
    errors.push("Pass percent must be 1–100");
  if (!draft.questions?.length) errors.push("Add at least one question");
  if (draft.questions.length > 50) errors.push("At most 50 questions");
  draft.questions.forEach((question, index) => errors.push(...questionErrors(question, index)));
  return errors;
}

function parseCorrect(value: string) {
  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part));
}

function normalizeJsonQuestion(raw: unknown, index: number): QuizQuestion {
  if (!raw || typeof raw !== "object") throw new Error(`Question ${index + 1} must be an object`);
  const value = raw as Record<string, unknown>;
  const options = Array.isArray(value["options"]) ? value["options"].map(String) : [];
  const typeValue = typeof value["type"] === "string" ? value["type"].toUpperCase() : "SINGLE_CHOICE";
  const type = (["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"].includes(typeValue)
    ? typeValue
    : "SINGLE_CHOICE") as QuizQuestionType;
  return {
    ...(typeof value["id"] === "string" ? { id: value["id"] } : {}),
    prompt: typeof value["prompt"] === "string" ? value["prompt"] : "",
    type,
    options,
    ...(typeof value["correctOption"] === "number" ? { correctOption: value["correctOption"] } : {}),
    ...(Array.isArray(value["correctOptions"])
      ? { correctOptions: value["correctOptions"].map(Number) }
      : {}),
    explanation: typeof value["explanation"] === "string" ? value["explanation"] : "",
    points: typeof value["points"] === "number" ? value["points"] : 1,
  };
}

export function parseQuizJson(text: string): { draft: QuizDraft; errors: string[] } {
  const parsed = JSON.parse(text) as unknown;
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { questions: parsed };
  const rawQuestions = Array.isArray(source["questions"]) ? source["questions"] : [];
  const questions = rawQuestions.map((question, index) => normalizeJsonQuestion(question, index));
  const draft: QuizDraft = {
    lesson: typeof source["lesson"] === "string" ? source["lesson"] : "",
    passPercent:
      typeof source["passPercent"] === "number" ? source["passPercent"] : DEFAULT_PASS_PERCENT,
    questions,
  };
  const errors = questions.flatMap((question, index) => questionErrors(question, index));
  if (!Number.isInteger(draft.passPercent) || draft.passPercent < 1 || draft.passPercent > 100)
    errors.push("Pass percent must be 1–100");
  return { draft, errors };
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((value) => value.some((cellValue) => cellValue.trim()));
}

export function parseQuizCsv(text: string): { draft: QuizDraft; errors: string[] } {
  const rows = parseCsvRows(text);
  if (!rows.length) return { draft: { lesson: "", passPercent: DEFAULT_PASS_PERCENT, questions: [] }, errors: ["CSV is empty"] };
  const first = rows[0]!.map((value) => value.trim().toLowerCase());
  const hasHeader = first.includes("prompt") || first.includes("type");
  const data = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader
    ? first
    : ["type", "prompt", "options", "correct", "explanation", "points"];
  const questions: QuizQuestion[] = [];
  const errors: string[] = [];
  data.forEach((values, index) => {
    const record = Object.fromEntries(header.map((key, column) => [key, values[column] ?? ""]));
    const typeValue = (record["type"] || "SINGLE_CHOICE").trim().toUpperCase();
    const type = (["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE"].includes(typeValue)
      ? typeValue
      : "SINGLE_CHOICE") as QuizQuestionType;
    const options = (record["options"] ?? "").split("|").map((value) => value.trim());
    const correct = parseCorrect(record["correct"] ?? "");
    const question: QuizQuestion = {
      prompt: record["prompt"] ?? "",
      type,
      options,
      ...(type === "MULTI_CHOICE"
        ? { correctOptions: correct }
        : { correctOption: correct[0] ?? null }),
      explanation: record["explanation"] ?? "",
      points: Number(record["points"] || 1),
    };
    questions.push(question);
    errors.push(...questionErrors(question, index));
  });
  const draft: QuizDraft = {
    lesson: "",
    passPercent: DEFAULT_PASS_PERCENT,
    questions,
  };
  return { draft, errors };
}

export function quizToJson(draft: QuizDraft) {
  return JSON.stringify(draft, null, 2);
}

export function quizToCsv(questions: QuizQuestion[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = ["type,prompt,options,correct,explanation,points"];
  for (const question of questions) {
    const correct =
      question.type === "MULTI_CHOICE"
        ? (question.correctOptions ?? []).join("|")
        : String(question.correctOption ?? "");
    lines.push(
      [
        question.type,
        escape(question.prompt),
        escape(question.options.join("|")),
        correct,
        escape(question.explanation ?? ""),
        String(question.points ?? 1),
      ].join(","),
    );
  }
  return lines.join("\n");
}


export function parseNotebookLmQuiz(text: string): { draft: QuizDraft; errors: string[] } {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      draft: { lesson: "", passPercent: DEFAULT_PASS_PERCENT, questions: [] },
      errors: ["NotebookLM input is empty"],
    };
  }
  const strippedFence = trimmed
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (strippedFence.startsWith("{") || strippedFence.startsWith("[")) {
    try {
      const rawParsed = JSON.parse(strippedFence) as unknown;
      const root =
        rawParsed && typeof rawParsed === "object" && !Array.isArray(rawParsed)
          ? (rawParsed as Record<string, unknown>)
          : { questions: rawParsed };
      const listRaw = Array.isArray(root["questions"])
        ? root["questions"]
        : Array.isArray(root["quiz"])
          ? root["quiz"]
          : [];
      const questions: QuizQuestion[] = listRaw.map((entry) => {
        const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        const prompt = String(rec["prompt"] ?? rec["question"] ?? "").trim();
        const answerOptions = Array.isArray(rec["answerOptions"])
          ? rec["answerOptions"]
          : Array.isArray(rec["options"])
            ? rec["options"]
            : Array.isArray(rec["choices"])
              ? rec["choices"]
              : [];
        const options: string[] = [];
        const correctIndexes: number[] = [];
        let rationales: string[] = [];
        answerOptions.forEach((opt, idx) => {
          if (opt && typeof opt === "object") {
            const optRec = opt as Record<string, unknown>;
            options.push(String(optRec["text"] ?? optRec["label"] ?? "").trim());
            if (optRec["isCorrect"] === true || optRec["correct"] === true) {
              correctIndexes.push(idx);
            }
            if (typeof optRec["rationale"] === "string" && optRec["rationale"].trim()) {
              rationales.push(optRec["rationale"].trim());
            }
          } else {
            options.push(String(opt ?? "").trim());
          }
        });
        if (correctIndexes.length === 0) {
          if (Array.isArray(rec["correctOptions"])) {
            for (const c of rec["correctOptions"]) {
              if (typeof c === "number") correctIndexes.push(c);
            }
          } else if (typeof rec["correctOption"] === "number") {
            correctIndexes.push(rec["correctOption"]);
          } else if (typeof rec["correctIndex"] === "number") {
            correctIndexes.push(rec["correctIndex"]);
          } else if (typeof rec["answer"] === "string") {
            const letter = rec["answer"].trim().toUpperCase();
            if (/^[A-H]$/.test(letter)) {
              correctIndexes.push(letter.charCodeAt(0) - 65);
            }
          }
        }
        const typeValue = typeof rec["type"] === "string" ? rec["type"].toUpperCase() : "";
        const type: QuizQuestionType =
          typeValue === "MULTI_CHOICE" || correctIndexes.length > 1
            ? "MULTI_CHOICE"
            : typeValue === "TRUE_FALSE"
              ? "TRUE_FALSE"
              : "SINGLE_CHOICE";
        const explanation = String(
          rec["explanation"] ?? rec["rationale"] ?? rationales[0] ?? "",
        ).trim();
        return {
          prompt,
          type,
          options,
          ...(type === "MULTI_CHOICE"
            ? { correctOptions: correctIndexes }
            : { correctOption: correctIndexes[0] ?? 0 }),
          explanation,
          points: typeof rec["points"] === "number" ? rec["points"] : 1,
        };
      });
      const draft: QuizDraft = {
        lesson: String(root["lesson"] ?? root["title"] ?? "").trim(),
        passPercent:
          typeof root["passPercent"] === "number" ? root["passPercent"] : DEFAULT_PASS_PERCENT,
        questions,
      };
      const errors = questions.length
        ? questions.flatMap((q, i) => questionErrors(q, i))
        : ["No questions found in NotebookLM JSON"];
      return { draft, errors };
    } catch {
      // Fall through to Markdown parser below if JSON parse fails.
    }
  }

  const lines = strippedFence.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];
  const questionStartRe =
    /^(?:#{1,4}\s*)?(?:\*\*)?(?:(?:Question|Câu)\s+\d+|\d+[.)])\s*[:.-]?\s*(?:\*\*)?/i;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (questionStartRe.test(line) && current.length > 0) {
      blocks.push(current);
      current = [line];
    } else if (questionStartRe.test(line) || current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const questions: QuizQuestion[] = [];
  for (const block of blocks) {
    const promptLine = block[0]!.replace(questionStartRe, "").replace(/\*\*$/g, "").trim();
    const options: string[] = [];
    const checkedCorrect: number[] = [];
    let explicitCorrect: number[] = [];
    let explanation = "";
    for (let i = 1; i < block.length; i += 1) {
      const line = block[i]!;
      const checkedMatch = line.match(/^[-*]?\s*\[(x|X| )\]\s*(?:[A-Ha-h][.)]\s*)?(.+)$/);
      const optMatch = !checkedMatch
        ? line.match(/^(?:[-*]\s*)?(?:\*\*)?([A-Ha-h])[.)](?:\*\*)?\s+(.+)$/)
        : null;
      const ansMatch = line.match(
        /^(?:\*\*)?(?:Answer|Correct|Đáp án(?:\s+đúng)?)(?:\*\*)?\s*[:：]\s*(.+)$/i,
      );
      const expMatch = line.match(
        /^(?:\*\*)?(?:Explanation|Rationale|Giải thích)(?:\*\*)?\s*[:：]\s*(.+)$/i,
      );
      if (checkedMatch) {
        const idx = options.length;
        options.push(checkedMatch[2]!.trim());
        if (checkedMatch[1]!.toLowerCase() === "x") checkedCorrect.push(idx);
      } else if (optMatch) {
        let textVal = optMatch[2]!.trim();
        if (/\((?:đúng|correct)\)\s*$/i.test(textVal) || /^✓\s*/.test(textVal)) {
          checkedCorrect.push(options.length);
          textVal = textVal.replace(/\((?:đúng|correct)\)\s*$/i, "").replace(/^✓\s*/, "").trim();
        }
        options.push(textVal);
      } else if (ansMatch) {
        const letters = [...ansMatch[1]!.toUpperCase().matchAll(/\b([A-H])\b/g)].map(
          (m) => m[1]!.charCodeAt(0) - 65,
        );
        if (letters.length > 0) explicitCorrect = letters;
      } else if (expMatch) {
        explanation = expMatch[1]!.trim();
      } else if (options.length === 0 && !ansMatch && !expMatch) {
        // Multi-line prompt continuation ignored cleanly or keep concise
      }
    }
    const finalCorrect = explicitCorrect.length > 0 ? explicitCorrect : checkedCorrect;
    const uniqueCorrect = [...new Set(finalCorrect)].filter((idx) => idx >= 0 && idx < options.length);
    const type: QuizQuestionType = uniqueCorrect.length > 1 ? "MULTI_CHOICE" : "SINGLE_CHOICE";
    questions.push({
      prompt: promptLine,
      type,
      options,
      ...(type === "MULTI_CHOICE"
        ? { correctOptions: uniqueCorrect }
        : { correctOption: uniqueCorrect[0] ?? 0 }),
      explanation,
      points: 1,
    });
  }

  const draft: QuizDraft = { lesson: "", passPercent: DEFAULT_PASS_PERCENT, questions };
  const errors = questions.length
    ? questions.flatMap((q, i) => questionErrors(q, i))
    : ["Could not recognize NotebookLM Markdown or JSON questions."];
  return { draft, errors };
}
