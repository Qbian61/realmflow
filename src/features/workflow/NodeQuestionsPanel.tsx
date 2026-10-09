import { Plus } from "lucide-react";
import { useState } from "react";
import type {
  NodeQuestionDto,
  WorkflowNodeExecutionDto,
} from "../../../shared/business";
import { Button, Field } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";

type Props = {
  requirementId: string;
  execution?: WorkflowNodeExecutionDto;
  questions: NodeQuestionDto[];
  onQuestionsChange: (questions: NodeQuestionDto[]) => void;
  onRefresh: () => Promise<void>;
};

function createQuestionId(): string {
  return globalThis.crypto.randomUUID();
}

export function NodeQuestionsPanel({
  requirementId,
  execution,
  questions,
  onQuestionsChange,
  onRefresh,
}: Props): JSX.Element | null {
  const { t } = useLocalization();
  const toast = useToast();
  const [draftId, setDraftId] = useState(createQuestionId);
  const [prompt, setPrompt] = useState("");
  const [required, setRequired] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(
      questions
        .filter((question) => question.answer)
        .map((question) => [question.id, question.answer as string]),
    ),
  );
  const [pendingId, setPendingId] = useState<string>();

  if (!execution && questions.length === 0) return null;

  const replaceQuestion = (saved: NodeQuestionDto): void => {
    onQuestionsChange(
      questions.map((question) =>
        question.id === saved.id ? saved : question,
      ),
    );
  };

  return (
    <section aria-labelledby="node-questions-title">
      <h3 id="node-questions-title">{t("workflowQuestions.title")}</h3>
      {execution ? (
        <form
          className="node-question-create"
          onSubmit={(event) => {
            event.preventDefault();
            const nextPrompt = prompt.trim();
            const business = window.realmflow?.business;
            if (!nextPrompt || !business) return;
            setPendingId(draftId);
            void business
              .openNodeQuestion({
                id: draftId,
                requirementId,
                nodeRunId: execution.nodeRun.id,
                prompt: nextPrompt,
                required,
                expectedRevision: 0,
              })
              .then(async (saved) => {
                onQuestionsChange([...questions, saved]);
                setPrompt("");
                setRequired(true);
                setDraftId(createQuestionId());
                await onRefresh();
              })
              .catch(() => {
                toast.error("workflowQuestions.createFailed", {
                  values: { error: t("common.unknownError") },
                  dedupeKey: "node-question-create-failed",
                });
              })
              .finally(() => setPendingId(undefined));
          }}
        >
          <Field name="workflow-questions-new-aria"
            className="node-question-field node-field--visually-hidden-label"
            label={t("workflowQuestions.newAria")}
          >
            <input
              maxLength={2_000}
              placeholder={t("workflowQuestions.placeholder")}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
          <label>
            <input name="node-questions-panel-required" autoComplete="off"
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            {t("workflowQuestions.requiredAnswer")}
          </label>
          <Button
            type="submit"
            variant="primary"
            leadingIcon={<Plus size={14} />}
            loading={pendingId === draftId}
            disabled={
              !prompt.trim() ||
              Boolean(pendingId) ||
              ["completed", "skipped", "cancelled"].includes(
                execution.nodeRun.status,
              )
            }
          >
            {t("workflowQuestions.add")}
          </Button>
        </form>
      ) : null}
      <div className="node-question-list">
        {questions.map((question) => (
          <div className="node-question" key={question.id}>
            <div className="node-question__prompt">
              {question.prompt}
              {question.required ? (
                <em>{t("workflowQuestions.required")}</em>
              ) : null}
            </div>
            {question.status === "open" ? (
              <div className="node-question__actions">
                <Field name={`node-question-${question.id}-answer`}
                  className="node-question-field node-field--visually-hidden-label"
                  label={t("workflowQuestions.answerAria", {
                    prompt: question.prompt,
                  })}
                >
                  <input
                    id={`node-question-${question.id}`}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Button
                  variant="primary"
                  loading={pendingId === question.id}
                  disabled={
                    pendingId === question.id ||
                    !(answers[question.id] ?? "").trim()
                  }
                  onClick={() => {
                    const business = window.realmflow?.business;
                    if (!business) return;
                    setPendingId(question.id);
                    void business
                      .answerNodeQuestion({
                        id: question.id,
                        requirementId,
                        nodeRunId: question.nodeRunId,
                        answer: answers[question.id]?.trim() ?? "",
                        expectedRevision: question.revision,
                      })
                      .then(async (saved) => {
                        replaceQuestion(saved);
                        await onRefresh();
                      })
                      .catch(() => {
                        toast.error("workflowQuestions.updateFailed", {
                          values: { error: t("common.unknownError") },
                          dedupeKey: "node-question-update-failed",
                        });
                      })
                      .finally(() => setPendingId(undefined));
                  }}
                >
                  {t("workflowQuestions.submit")}
                </Button>
                {!question.required ? (
                  <Button
                    variant="ghost"
                    aria-label={t("workflowQuestions.dismissAria", {
                      prompt: question.prompt,
                    })}
                    loading={pendingId === question.id}
                    disabled={pendingId === question.id}
                    onClick={() => {
                      const business = window.realmflow?.business;
                      if (!business) return;
                      setPendingId(question.id);
                      void business
                        .dismissNodeQuestion({
                          id: question.id,
                          requirementId,
                          nodeRunId: question.nodeRunId,
                          expectedRevision: question.revision,
                        })
                        .then(async (saved) => {
                          replaceQuestion(saved);
                          await onRefresh();
                        })
                        .catch(() => {
                          toast.error("workflowQuestions.updateFailed", {
                            values: { error: t("common.unknownError") },
                            dedupeKey: "node-question-update-failed",
                          });
                        })
                        .finally(() => setPendingId(undefined));
                    }}
                  >
                    {t("workflowQuestions.dismiss")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p>
                {question.status === "dismissed"
                  ? t("workflowQuestions.dismissed")
                  : question.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
