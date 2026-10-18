import type { AssistantDisplayNode } from "../../../domain/assistant-turn";
import { useLocalization } from "../../localization/LocalizationProvider";
import { SortedAssistantNodes } from "./assistant-node-renderers";
import type { AssistantDisclosureState } from "./use-assistant-disclosure-state";

export function AssistantDisplayTree({
  nodes,
  disclosure,
}: {
  nodes: readonly AssistantDisplayNode[];
  disclosure: AssistantDisclosureState;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <div
      className="assistant-display-tree"
      data-testid="assistant-display-tree-scroll"
      ref={(element) => disclosure.restoreScroll("display-tree", element)}
      onScroll={(event) =>
        disclosure.saveScroll("display-tree", event.currentTarget.scrollTop)
      }
    >
      <SortedAssistantNodes nodes={nodes} disclosure={disclosure} t={t} />
    </div>
  );
}
