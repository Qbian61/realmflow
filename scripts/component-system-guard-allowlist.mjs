const RULE_METADATA = {
  "control-size": {
    reason:
      "Freeze audited legacy domain controls that predate the shared 28/32/36px scale.",
    removalCondition:
      "Remove each baseline after the owning surface migrates its remaining controls to Button, IconButton or Field.",
  },
  "primitive-visual-copy": {
    reason:
      "Freeze audited page-owned control visuals that have not yet migrated to shared primitives.",
    removalCondition:
      "Remove each baseline after the owning stylesheet no longer duplicates complete Button, Field, Menu or InlineAlert visuals.",
  },
  "focus-visible": {
    reason:
      "Freeze audited outline suppression while domain controls retain their current composite focus treatment.",
    removalCondition:
      "Remove each baseline after every suppressed outline has an explicit visible focus-visible replacement.",
  },
  "named-layer": {
    reason:
      "Freeze audited numeric stacking contexts that predate the shared layer token scale.",
    removalCondition:
      "Remove each baseline after the owning surface uses a named --ui-layer-* token or no longer needs a stacking context.",
  },
  "error-color-only": {
    reason:
      "Freeze audited local error text that has not yet adopted InlineAlert or another non-color cue.",
    removalCondition:
      "Remove each baseline after the owning error surface uses InlineAlert, Field error semantics or an equivalent non-color indicator.",
  },
  "tone-token": {
    reason:
      "Freeze the existing concrete-value Light and Dark tone token inventory.",
    removalCondition:
      "Remove this baseline after concrete-value tone tokens are replaced by semantic theme tokens.",
  },
};

const OWNER_BY_FILE = {
  "src/styles.css": "UI Platform",
  "src/components/ui/ui.css": "UI Platform",
  "src/features/artifacts/artifact-workbench.css": "Artifact Workbench",
  "src/features/toast/toast.css": "UI Platform",
  "src/features/workbench/native-workbench-menu.css": "Workbench",
  "src/features/workbench/workbench.css": "Workbench",
};

const baseline = (ruleId, file, expectedCount, fingerprint) => ({
  ruleId,
  file,
  selector: `<baseline:${ruleId}>`,
  expectedCount,
  fingerprint,
  owner: OWNER_BY_FILE[file],
  ...RULE_METADATA[ruleId],
});

export const componentSystemGuardAllowlist = [
  baseline(
    "control-size",
    "src/features/artifacts/artifact-workbench.css",
    4,
    "e152a9077d46d3764f093a041a07b048b166c4f4c9d03f6b5ef49d3eb0d6f865",
  ),
  baseline(
    "control-size",
    "src/features/workbench/workbench.css",
    3,
    "3143bb5b64e722722e451ac6ed11cd56e67fc5b90dbd8fc18b5d6bbde5ffa0c9",
  ),
  baseline(
    "control-size",
    "src/styles.css",
    48,
    "8ad959f7a632c2a288c35223e77555121bb6eb770c4eefbebfd2f0ec2d9b7acb",
  ),
  baseline(
    "error-color-only",
    "src/features/workbench/workbench.css",
    2,
    "149175fb8d323bdc830c93cf22906269ccb9302ccfe313bd43fe60ac2ea16bc1",
  ),
  baseline(
    "error-color-only",
    "src/styles.css",
    13,
    "dabd29b2946c31812df3797d403556a99abdf7e06c4848f16738fda87c5866cc",
  ),
  baseline(
    "focus-visible",
    "src/components/ui/ui.css",
    3,
    "6ce337a84b2ab8d75d28706f246652653806c0308fce440bf7cf5fd4e2a9f282",
  ),
  baseline(
    "focus-visible",
    "src/features/workbench/native-workbench-menu.css",
    1,
    "5e080bf05e763d2d3fffa9f61073f9131b9fef94b0e36cd0bb0bc59424b38107",
  ),
  baseline(
    "focus-visible",
    "src/features/workbench/workbench.css",
    1,
    "680c712f1199c8ab543b7f8b3d5e42b2564d4747991132dbc6d858c536a01c44",
  ),
  baseline(
    "focus-visible",
    "src/styles.css",
    43,
    "ae322b400fed0cecdb4369f0ff9ac2db1e2c305261e4e8a8061c26331517d03b",
  ),
  baseline(
    "named-layer",
    "src/features/artifacts/artifact-workbench.css",
    1,
    "6fc844b096a85d56bd91b3d649ee0c86bb3763b750a597cae2f850a344f48645",
  ),
  baseline(
    "named-layer",
    "src/features/toast/toast.css",
    1,
    "0356d97e4ad7a53b501e51cd5faea82df3ab1dd0186cf79b76f85f87230fb9c9",
  ),
  baseline(
    "named-layer",
    "src/features/workbench/workbench.css",
    6,
    "22e721d2f065be224b8de7892deea0a230de8e5a840bb7fda0978373d79cf09c",
  ),
  baseline(
    "named-layer",
    "src/styles.css",
    54,
    "a2b5c386238b5ed64861ea712237f8aa8e041d7616b1f79f9784c3a3e7ba1412",
  ),
  baseline(
    "primitive-visual-copy",
    "src/features/artifacts/artifact-workbench.css",
    4,
    "639863689212f453252ce16e76d892b2fb56ca87ffd9d4f1a156665e0ce87b5a",
  ),
  baseline(
    "primitive-visual-copy",
    "src/features/workbench/native-workbench-menu.css",
    1,
    "714396be957de12f1ee642a4e91bc126fc9d7732412de65640be5a4cc9c9f64e",
  ),
  baseline(
    "primitive-visual-copy",
    "src/features/workbench/workbench.css",
    4,
    "f125cefe2d17a787f41ae6e22f5ec9b6bd31da2a2393e3d2129987760c6c1147",
  ),
  baseline(
    "primitive-visual-copy",
    "src/styles.css",
    129,
    "251c74b2fb26e110fd9975024f89821416b8bd995913fac81aaf960b870e038d",
  ),
  baseline(
    "tone-token",
    "src/styles.css",
    534,
    "0515aa7806d0b0b3f96eb39195ed638060968e01a0ac0d56824e1bde5535c210",
  ),
];
