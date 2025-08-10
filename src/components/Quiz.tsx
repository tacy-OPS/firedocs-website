import React, { useMemo, useState } from "react";

/**
 * MDX-ready Quiz component with step navigation, detailed review, and score.
 *
 * Usage in MDX:
 * import Quiz from '@site/src/components/Quiz';
 * import ch1 from '@site/static/quizzes/ch1.json';
 * <Quiz title="Chapitre 1" questions={ch1} stepMode requireAnswerBeforeNext />
 */

export type QuizOption = {
  id?: string;
  text: string;
  correct?: boolean;
  explanation?: string;
  ref?: string; // link to revision page
};

export type QuizItem = {
  id?: string;
  question: string;
  options: QuizOption[];
  multi?: boolean; // multiple correct answers allowed
};

export type QuizProps = {
  title?: string;
  questions: QuizItem[];
  shuffle?: boolean; // shuffle questions
  shuffleOptions?: boolean; // shuffle options inside each question
  allowRetry?: boolean;
  showRefs?: boolean;
  // Step-by-step navigation
  stepMode?: boolean; // show one question at a time, with Suivante/Précédente
  requireAnswerBeforeNext?: boolean; // if true, Next/Terminer disabled until answered
};

function shuffleArray<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function sanitizeId(prefix: string, index: number, provided?: string) {
  return provided || `${prefix}-${index}`;
}

function renderMarkdownLite(text: string) {
  // very small markdown-like renderer for **bold** and *italic*
  const bold = text.split(/(\*\*[^*]+\*\*)/g).flatMap((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`b${i}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
  return bold.map((part, i) =>
    typeof part === "string"
      ? part.split(/(\*[^*]+\*)/g).map((p, j) =>
          /^\*[^*]+\*$/.test(p) ? <em key={`e${i}-${j}`}>{p.slice(1, -1)}</em> : p
        )
      : part
  );
}

export default function Quiz({
  title,
  questions,
  shuffle = false,
  shuffleOptions = false,
  allowRetry = true,
  showRefs = true,
  stepMode = false,
  requireAnswerBeforeNext = true,
}: QuizProps) {
  const prepared = useMemo(() => {
    const q = (shuffle ? shuffleArray(questions) : [...questions]).map((item, qi) => {
      const options = shuffleOptions ? shuffleArray(item.options) : [...item.options];
      return {
        ...item,
        id: sanitizeId("q", qi, item.id),
        options: options.map((o, oi) => ({ ...o, id: sanitizeId(`q${qi}-o`, oi, o.id) })),
      } as QuizItem;
    });
    return q;
  }, [questions, shuffle, shuffleOptions]);

  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [checked, setChecked] = useState(false);
  const [idx, setIdx] = useState(0); // current question index for step mode

  const total = prepared.length;

  const score = useMemo(() => {
    if (!checked) return 0;
    return prepared.reduce((acc, q) => {
      const selected = new Set(answers[q.id!]);
      const correct = new Set(q.options.filter((o) => o.correct).map((o) => o.id!));
      const ok = selected.size === correct.size && [...selected].every((id) => correct.has(id));
      return acc + (ok ? 1 : 0);
    }, 0);
  }, [prepared, answers, checked]);

  // Detailed wrong answers with explanations and refs
  const wrongDetails = useMemo(() => {
    if (!checked)
      return [] as Array<{
        questionId: string;
        question: string;
        details: Array<{ text: string; explanation?: string; ref?: string }>;
      }>;

    const out: Array<{
      questionId: string;
      question: string;
      details: Array<{ text: string; explanation?: string; ref?: string }>;
    }> = [];

    prepared.forEach((q) => {
      const selected = new Set(answers[q.id!]);
      const correctIds = q.options.filter((o) => o.correct).map((o) => o.id!);
      const ok = selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
      if (!ok) {
        const details = q.options
          .filter((o) => o.correct)
          .map((o) => ({ text: o.text, explanation: o.explanation, ref: o.ref }));
        out.push({ questionId: q.id!, question: q.question, details });
      }
    });
    return out;
  }, [prepared, answers, checked]);

  const wrongRefs = useMemo(() => {
    if (!checked) return [] as string[];
    const set = new Set<string>();
    wrongDetails.forEach((w) => w.details.forEach((d) => d.ref && set.add(d.ref)));
    return Array.from(set);
  }, [wrongDetails, checked]);

  function toggleChoice(qid: string, oid: string, multi: boolean | undefined) {
    setAnswers((prev) => {
      const picked = new Set(prev[qid] || []);
      if (multi) {
        picked.has(oid) ? picked.delete(oid) : picked.add(oid);
        return { ...prev, [qid]: [...picked] };
      }
      return { ...prev, [qid]: [oid] };
    });
  }

  function canGoNext(current: number) {
    if (!requireAnswerBeforeNext) return true;
    const q = prepared[current];
    return (answers[q.id!]?.length || 0) > 0;
  }

  function handleNext() {
    if (idx < total - 1) {
      if (!canGoNext(idx)) return;
      setIdx((i) => Math.min(i + 1, total - 1));
    } else {
      // last question -> Terminer
      onSubmit();
    }
  }
  function handlePrev() {
    setIdx((i) => Math.max(i - 1, 0));
  }

  function onSubmit() {
    setChecked(true);
  }

  function onRetry() {
    setAnswers({});
    setChecked(false);
    setIdx(0);
  }

  // Renders a single question block
  function QuestionBlock({ q, index }: { q: QuizItem; index: number }) {
    const selected = new Set(answers[q.id!]);
    const correctIds = new Set(q.options.filter((o) => o.correct).map((o) => o.id!));
    const isCorrect = checked && selected.size === correctIds.size && [...selected].every((id) => correctIds.has(id));

    return (
      <div key={q.id} style={styles.card}>
        <div style={styles.questionHeader}>
          <div style={styles.qBadge}>Q{index + 1}</div>
          <div style={styles.questionText}>{renderMarkdownLite(q.question)}</div>
        </div>

        <div style={styles.optionsWrap}>
          {q.options.map((o) => {
            const chosen = selected.has(o.id!);
            const good = !!o.correct;
            const stateStyle = checked
              ? good
                ? styles.optCorrect
                : chosen
                ? styles.optWrong
                : styles.optNeutral
              : styles.optNeutral;

            return (
              <label key={o.id} style={{ ...styles.option, ...stateStyle }}>
                <input
                  type={q.multi ? "checkbox" : "radio"}
                  name={q.id}
                  checked={chosen}
                  onChange={() => toggleChoice(q.id!, o.id!, !!q.multi)}
                  style={styles.input}
                  disabled={checked}
                />
                <span>{o.text}</span>
              </label>
            );
          })}
        </div>

        {checked && (
          <div style={styles.feedback}>
            {isCorrect ? (
              <span style={styles.good}>✅ Correct</span>
            ) : (
              <span style={styles.bad}>❌ Incorrect</span>
            )}
            <ul style={styles.explanations}>
              {q.options
                .filter((o) => o.correct)
                .map((o) => (
                  <li key={`exp-${o.id}`}>
                    {o.explanation && <span>{o.explanation} </span>}
                    {showRefs && o.ref && (
                      <a href={o.ref} style={styles.refLink}>
                        ↗ Voir la fiche associée
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {title && <h2 style={styles.title}>{title}</h2>}

      {/* Always show results summary on top after validation */}
      {checked && (
        <div style={styles.resultsBox}>
          <div style={styles.scoreLine}>
            🧮 Score: <strong>{score}</strong> / {total}
          </div>
          <progress value={score} max={total} style={styles.progress} />
        </div>
      )}

      {!stepMode && (
        // FULL LIST MODE
        <>
          {prepared.map((q, i) => (
            <QuestionBlock key={q.id} q={q} index={i} />
          ))}

          {!checked ? (
            <button style={styles.primaryBtn} onClick={onSubmit} disabled={prepared.some((q) => !answers[q.id!]?.length)}>
              Valider mes réponses
            </button>
          ) : (
            allowRetry && (
              <button style={styles.secondaryBtn} onClick={onRetry}>
                Recommencer
              </button>
            )
          )}
        </>
      )}

      {stepMode && !checked && (
        // STEP MODE (one question at a time)
        <>
          <div style={styles.progressLine}>Question {idx + 1} / {total}</div>
          <QuestionBlock q={prepared[idx]} index={idx} />

          <div style={styles.navRow}>
            <button style={styles.secondaryBtn} onClick={handlePrev} disabled={idx === 0}>
              ◀ Précédente
            </button>
            {idx < total - 1 ? (
              <button
                style={styles.primaryBtn}
                onClick={handleNext}
                disabled={requireAnswerBeforeNext && !(answers[prepared[idx].id!]?.length > 0)}
              >
                Suivante ▶
              </button>
            ) : (
              <button
                style={styles.primaryBtn}
                onClick={handleNext}
                disabled={requireAnswerBeforeNext && !(answers[prepared[idx].id!]?.length > 0)}
              >
                Terminer ✅
              </button>
            )}
          </div>
        </>
      )}

      {/* RESULTS SUMMARY (both modes) */}
      {checked && (
        <div style={{ marginTop: 12 }}>
          {wrongDetails.length > 0 && (
            <div style={styles.reviewBox}>
              <div style={styles.reviewTitle}>📚 Réviser mes erreurs</div>
              <ul style={styles.reviewList}>
                {wrongRefs.map((href) => (
                  <li key={href}>
                    <a href={href} style={styles.reviewLink}>Ouvrir la fiche associée</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {wrongDetails.length > 0 && (
            <div style={styles.detailBox}>
              <div style={styles.detailTitle}>🧩 Détail des questions en erreur</div>
              <ol style={styles.detailList}>
                {wrongDetails.map((w) => (
                  <li key={w.questionId} style={{ marginBottom: 8 }}>
                    <div style={styles.detailQuestion}>{renderMarkdownLite(w.question)}</div>
                    <ul style={{ marginTop: 6 }}>
                      {w.details.map((d, i) => (
                        <li key={`${w.questionId}-${i}`}>
                          <span>{d.text}</span>
                          {d.explanation && <span> — {d.explanation}</span>}
                          {showRefs && d.ref && (
                            <a href={d.ref} style={{ ...styles.refLink, marginLeft: 6 }}>
                              ↗ fiche
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 16,
    padding: 16,
    background: "var(--ifm-background-color, #fff)",
    border: "1px solid rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    marginBottom: 12,
    fontSize: 24,
    fontWeight: 700,
  },
  card: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    background: "rgba(0,0,0,0.02)",
  },
  qBadge: {
    fontWeight: 700,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.08)",
    marginRight: 8,
  },
  questionHeader: {
    display: "flex",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  questionText: {
    fontSize: 16,
    fontWeight: 600,
  },
  optionsWrap: {
    display: "grid",
    gap: 8,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    cursor: "pointer",
    userSelect: "none",
  },
  input: {
    margin: 0,
  },
  optNeutral: {
    background: "#fff",
  },
  optCorrect: {
    background: "#e8f7ee",
    borderColor: "#90d3a6",
  },
  optWrong: {
    background: "#fde8ea",
    borderColor: "#e5a0aa",
  },
  feedback: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid rgba(0,0,0,0.08)",
  },
  good: { color: "#167c3d", fontWeight: 600 },
  bad: { color: "#a11a2a", fontWeight: 600 },
  explanations: {
    marginTop: 8,
    marginBottom: 0,
  },
  refLink: {
    textDecoration: "underline",
    marginLeft: 4,
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#1a73e8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#f3f4f6",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  resultsBox: {
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  scoreLine: {
    fontSize: 16,
    fontWeight: 600,
  },
  progress: {
    height: 10,
  },
  progressLine: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
  },
  reviewBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(26,115,232,0.05)",
    border: "1px solid rgba(26,115,232,0.2)",
  },
  reviewTitle: { fontWeight: 700, marginBottom: 8 },
  reviewList: { margin: 0 },
  reviewLink: { textDecoration: "underline" },
  detailBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(0,0,0,0.02)",
    border: "1px solid rgba(0,0,0,0.08)",
  },
  detailTitle: { fontWeight: 700, marginBottom: 8 },
  detailList: { margin: 0 },
  detailQuestion: { fontWeight: 600 },
};
