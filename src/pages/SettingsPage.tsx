import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { WorkRootDto } from "../../shared/business";
import { BackupSettings } from "../features/settings/BackupSettings";
import { BuiltinProviderDialog } from "../features/settings/BuiltinProviderDialog";
import { GeneralSettings } from "../features/settings/GeneralSettings";
import {
  ProfileDeleteDialog,
  ProfileEditor,
  ProviderDeleteDialog,
  ProviderEditor,
} from "../features/settings/ModelEditors";
import { ModelSettings } from "../features/settings/ModelSettings";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { useModelSettingsController } from "../features/settings/use-model-settings-controller";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import { InlineAlert, PageBody, Toolbar } from "../components/ui";
import {
  getSettingsSectionLabel,
  newProfileDraft,
  newProviderDraft,
  resolveSettingsSection,
} from "./settings-page-config";

export default function SettingsPage(): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const location = useLocation();
  const business = window.realmflow?.business;
  const [workRoots, setWorkRoots] = useState<WorkRootDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [choosingWorkRoot, setChoosingWorkRoot] = useState(false);
  const [error, setError] = useState("");
  const providerMenuAnchorRef = useRef<HTMLButtonElement>();
  const activeSection = resolveSettingsSection(location.search);
  const model = useModelSettingsController(business, t, setError);

  useEffect(() => {
    if (!business) {
      setError(t("settings.unavailable"));
      setLoading(false);
      return;
    }
    void business
      .listWorkRoots()
      .then((roots) => {
        setWorkRoots(roots);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : t("settings.loadFailed"),
        );
      })
      .finally(() => setLoading(false));
  }, [business, t]);

  const pageTitle = getSettingsSectionLabel(t, activeSection);
  const workRoot = workRoots.find(({ isCurrent }) => isCurrent);
  const historicalWorkRoots = workRoots.filter(({ isCurrent }) => !isCurrent);

  async function chooseWorkRoot(): Promise<void> {
    if (!business) return;
    setChoosingWorkRoot(true);
    try {
      const selected = await business.chooseWorkRoot();
      if (selected) {
        setWorkRoots((current) => [
          selected,
          ...current
            .filter(({ id }) => id !== selected.id)
            .map((candidate) => ({ ...candidate, isCurrent: false })),
        ]);
      }
    } catch {
      toast.error("settings.workRoot.chooseFailed");
    } finally {
      setChoosingWorkRoot(false);
    }
  }

  return (
    <div className="settings-page">
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="settings-page-header"
          aria-label={pageTitle}
        >
          <h1 className="sr-only">{t("settings.title")}</h1>
          <h2 className="settings-page-header-title">{pageTitle}</h2>
        </Toolbar>
      </WorkspaceHeaderPortal>

      <PageBody
        mode={activeSection === "models" ? "split" : "contained"}
        className={
          activeSection === "models"
            ? "settings-content settings-content-models"
            : "settings-content"
        }
      >
        <div className="settings-section-stack">
          {error ? (
            <InlineAlert
              className="model-page-error"
              tone="danger"
              title={error}
            />
          ) : null}

          {activeSection === "general" ? (
            <GeneralSettings
              currentWorkRoot={workRoot}
              historicalWorkRoots={historicalWorkRoots}
              effectiveModels={model.effectiveModels}
              applicationModelDefault={model.applicationModelDefault}
              loading={loading || model.loading}
              savingModelDefault={model.savingModelDefault}
              choosingWorkRoot={choosingWorkRoot}
              onChooseWorkRoot={() => void chooseWorkRoot()}
              onChangeModelDefault={(preference) =>
                void model.saveApplicationModelDefault(preference)
              }
            />
          ) : activeSection === "models" ? (
            <ModelSettings
              providers={model.providers}
              profiles={model.profiles}
              loading={model.loading}
              saving={model.saving}
              validatingProfileIds={model.validatingProfileIds}
              staleProfileIds={model.staleProfileIds}
              rotatingCredentialKey={model.rotatingCredentialKey}
              credentialRotationSummary={model.credentialRotationSummary}
              selectedProviderId={model.selectedProviderId}
              onSelectProvider={model.setSelectedProviderId}
              onAddProvider={(anchorElement) => {
                providerMenuAnchorRef.current = anchorElement;
                void model.openProviderDialog();
              }}
              onEditProvider={(provider) =>
                model.setProviderDraft({
                  ...provider,
                  apiKey: "",
                  customHeaders: (provider.customHeaderNames ?? []).map(
                    (name) => ({ name, value: "", configured: true }),
                  ),
                  expectedRevision: provider.revision,
                })
              }
              onDeleteProvider={model.setProviderToDelete}
              onRemoveCredential={(provider) =>
                void model.removeProviderCredential(provider)
              }
              onToggleProvider={(provider) =>
                void model.toggleProvider(provider)
              }
              onAddProfile={(providerId) => {
                const provider = model.providers.find(
                  ({ id }) => id === providerId,
                );
                model.setProfileDraft(
                  newProfileDraft(providerId, provider?.type),
                );
              }}
              onEditProfile={(profile) =>
                model.setProfileDraft({
                  ...profile,
                  capabilities: { ...profile.capabilities },
                  expectedRevision: profile.revision,
                })
              }
              onDeleteProfile={model.setProfileToDelete}
              onToggleProfile={(profile) => void model.toggleProfile(profile)}
              onSetProfilesEnabled={(profiles, enabled) =>
                void model.setProfilesEnabled(profiles, enabled)
              }
              onValidateProfile={(profile) =>
                void model.validateProfile(profile)
              }
              onRotateCredentialKey={() => void model.rotateCredentialKey()}
            />
          ) : activeSection === "backup" && business ? (
            <BackupSettings business={business} />
          ) : null}
        </div>
      </PageBody>

      {model.showBuiltinProviderDialog && providerMenuAnchorRef.current ? (
        <BuiltinProviderDialog
          anchorElement={providerMenuAnchorRef.current}
          configuredProviderIds={new Set(model.providers.map(({ id }) => id))}
          saving={model.saving}
          onClose={() => model.setShowBuiltinProviderDialog(false)}
          onConfigure={(catalogId, credential) =>
            void model.configureBuiltinProvider(catalogId, credential)
          }
          onCustom={() => {
            model.setShowBuiltinProviderDialog(false);
            model.setProviderDraft(newProviderDraft());
          }}
        />
      ) : null}
      {model.providerDraft ? (
        <ProviderEditor
          draft={model.providerDraft}
          saving={model.saving}
          onChange={model.setProviderDraft}
          onClose={() => model.setProviderDraft(undefined)}
          onSubmit={model.saveProvider}
        />
      ) : null}
      {model.profileDraft ? (
        <ProfileEditor
          draft={model.profileDraft}
          providers={model.providers}
          saving={model.saving}
          onChange={model.setProfileDraft}
          onClose={() => model.setProfileDraft(undefined)}
          onSubmit={model.saveProfile}
        />
      ) : null}
      {model.providerToDelete ? (
        <ProviderDeleteDialog
          provider={model.providerToDelete}
          saving={model.saving}
          onClose={() => model.setProviderToDelete(undefined)}
          onConfirm={() => void model.deleteProvider()}
        />
      ) : null}
      {model.profileToDelete ? (
        <ProfileDeleteDialog
          profile={model.profileToDelete}
          saving={model.saving}
          onClose={() => model.setProfileToDelete(undefined)}
          onConfirm={() => void model.deleteProfile()}
        />
      ) : null}
    </div>
  );
}
