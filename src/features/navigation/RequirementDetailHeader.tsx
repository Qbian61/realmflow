import { WorkspaceHeaderPortal } from "./WorkspaceLayout";
import { useLocalization } from "../../localization/LocalizationProvider";
import { Tab, TabList, Tabs, Toolbar } from "../../components/ui";

type RequirementDetailHeaderProps = {
  title: string;
};

export function RequirementDetailHeader({
  title,
}: RequirementDetailHeaderProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <WorkspaceHeaderPortal>
      <Toolbar
        variant="workspace-header"
        className="requirement-page-header"
        aria-label={t("requirementDetail.title")}
      >
        <Tabs value="detail" onValueChange={() => undefined}>
          <TabList
            className="requirement-page-tabs"
            aria-label={t("requirementDetail.title")}
          >
            <Tab
              className="requirement-page-name"
              value="detail"
              title={title}
            >
              <span>{title}</span>
            </Tab>
          </TabList>
        </Tabs>
      </Toolbar>
    </WorkspaceHeaderPortal>
  );
}
