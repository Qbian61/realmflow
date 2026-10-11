import type { MissedRunPolicy } from "../../../domain/schedule";
import { Field, Select } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export function MissedRunPolicyField({
  value,
  onChange,
}: {
  value: MissedRunPolicy;
  onChange: (value: MissedRunPolicy) => void;
}): JSX.Element {
  const { t } = useLocalization();

  return (
    <Field name="schedule-form-missed-run-policy" label={t("schedule.form.missedRunPolicy")}>
      <Select
        aria-label={t("schedule.form.missedRunPolicy")}
        value={value}
        onChange={(event) => onChange(event.target.value as MissedRunPolicy)}
      >
        <option value="skip">{t("schedule.policy.skipOption")}</option>
        <option value="run_once">{t("schedule.policy.runOnceOption")}</option>
      </Select>
    </Field>
  );
}
