import { formatSkillName } from "@/lib/skill-names";

export type IndicatorRow = {
  id: string;
  key: string;
  label: string;
  group_id: string;
  sort_order: number;
  active: boolean;
};

export type IndicatorGroupRow = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type IndicatorGroup = IndicatorGroupRow & { indicators: IndicatorRow[] };

export type IndicatorMeta = {
  key: string;
  label: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  order: number;
  // an indicator is "active" only when both it and its group are active
  active: boolean;
};

// Serializable (plain objects only) so it can cross into client components.
export type IndicatorConfig = {
  groups: IndicatorGroup[];
  byKey: Record<string, IndicatorMeta>;
  // true when the structure came from the legacy programs.skill_template
  // (migration not run yet, or no groups configured for the program)
  legacy: boolean;
};

export const EMPTY_INDICATOR_CONFIG: IndicatorConfig = { groups: [], byKey: {}, legacy: false };

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function buildIndicatorConfig(
  groupRows: IndicatorGroupRow[],
  indicatorRows: IndicatorRow[],
  legacy = false
): IndicatorConfig {
  const groups: IndicatorGroup[] = [...groupRows]
    .sort(bySort)
    .map((g) => ({
      ...g,
      indicators: indicatorRows.filter((i) => i.group_id === g.id).sort(bySort),
    }));

  const byKey: Record<string, IndicatorMeta> = {};
  for (const g of groups) {
    for (const i of g.indicators) {
      byKey[i.key] = {
        key: i.key,
        label: i.label,
        groupId: g.id,
        groupName: g.name,
        groupOrder: g.sort_order,
        order: i.sort_order,
        active: i.active && g.active,
      };
    }
  }
  return { groups, byKey, legacy };
}

// Pre-migration / unconfigured programs: the old flat template, each name is
// both key and label, grouped by its "Kategori - Nama" prefix so the form is
// still usable. Nothing is written for these.
export function legacyIndicatorConfig(skillTemplate: string[]): IndicatorConfig {
  const groupRows: IndicatorGroupRow[] = [];
  const indicatorRows: IndicatorRow[] = [];
  const groupIds = new Map<string, string>();

  skillTemplate.forEach((raw, idx) => {
    const name = formatSkillName(raw);
    const sep = name.indexOf(" - ");
    const groupName = sep === -1 ? "Indikator" : name.slice(0, sep);
    const label = sep === -1 ? name : name.slice(sep + 3);
    let gid = groupIds.get(groupName);
    if (!gid) {
      gid = `legacy-${groupIds.size}`;
      groupIds.set(groupName, gid);
      groupRows.push({ id: gid, name: groupName, sort_order: groupIds.size, active: true });
    }
    indicatorRows.push({
      id: `legacy-i-${idx}`,
      key: raw,
      label,
      group_id: gid,
      sort_order: idx,
      active: true,
    });
  });

  return buildIndicatorConfig(groupRows, indicatorRows, true);
}

// Every key in display order (group order, then indicator order), any status.
export function allKeys(config: IndicatorConfig): string[] {
  return config.groups.flatMap((g) => g.indicators.map((i) => i.key));
}

export function activeKeys(config: IndicatorConfig): string[] {
  return allKeys(config).filter((k) => config.byKey[k]?.active);
}

export function activeGroups(config: IndicatorConfig): IndicatorGroup[] {
  return config.groups
    .filter((g) => g.active)
    .map((g) => ({ ...g, indicators: g.indicators.filter((i) => i.active) }))
    .filter((g) => g.indicators.length > 0);
}

// "Gaya Dada - Timing": the compact name used in charts, achievements, lists.
export function displayName(config: IndicatorConfig, key: string): string {
  const meta = config.byKey[key];
  if (!meta) return formatSkillName(key);
  return `${meta.groupName} - ${meta.label}`;
}

export type IndicatorSnapshot = Record<
  string,
  { label: string; group: string; gorder: number; order: number }
>;

// Frozen at write time so a report keeps the labels/groups it was written with.
export function buildSnapshot(config: IndicatorConfig, keys: string[]): IndicatorSnapshot {
  const snapshot: IndicatorSnapshot = {};
  for (const key of keys) {
    const meta = config.byKey[key];
    if (!meta) continue;
    snapshot[key] = {
      label: meta.label,
      group: meta.groupName,
      gorder: meta.groupOrder,
      order: meta.order,
    };
  }
  return snapshot;
}

export type ResolvedIndicator = {
  key: string;
  label: string;
  group: string;
  gorder: number;
  order: number;
  score: number;
};

// Resolves each scored key for display: the report's own snapshot wins, then
// the current structure (legacy reports have no snapshot), then the raw key.
export function resolveReportIndicators(
  scores: Record<string, number>,
  snapshot: IndicatorSnapshot | null | undefined,
  config: IndicatorConfig
): ResolvedIndicator[] {
  return Object.keys(scores)
    .map((key, i) => {
      const snap = snapshot?.[key];
      const meta = config.byKey[key];
      if (snap) {
        return { key, label: snap.label, group: snap.group, gorder: snap.gorder, order: snap.order, score: scores[key] };
      }
      if (meta) {
        return { key, label: meta.label, group: meta.groupName, gorder: meta.groupOrder, order: meta.order, score: scores[key] };
      }
      const name = formatSkillName(key);
      const sep = name.indexOf(" - ");
      return {
        key,
        label: sep === -1 ? name : name.slice(sep + 3),
        group: sep === -1 ? "Lainnya" : name.slice(0, sep),
        gorder: 9999,
        order: i,
        score: scores[key],
      };
    })
    .sort((a, b) => a.gorder - b.gorder || a.group.localeCompare(b.group) || a.order - b.order);
}

export type FormGroup = {
  id: string;
  name: string;
  indicators: { key: string; label: string; inactive: boolean }[];
};

// Groups for the pengajar's report form: only active indicators of active
// groups, plus (when editing an old report) any indicator that report already
// scored even if it has since been deactivated, marked as inactive.
export function formGroups(config: IndicatorConfig, alsoKeys: string[] = []): FormGroup[] {
  const extra = new Set(alsoKeys);
  return config.groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      indicators: g.indicators
        .filter((i) => (i.active && g.active) || extra.has(i.key))
        .map((i) => ({ key: i.key, label: i.label, inactive: !(i.active && g.active) })),
    }))
    .filter((g) => g.indicators.length > 0);
}

// Groups worth opening first: ones where the child has a score that is
// started but not yet mastered. Falls back to the first group.
export function relevantGroupIds(
  groups: FormGroup[],
  latestScores: Record<string, number> | null | undefined
): string[] {
  const ids = groups
    .filter((g) =>
      g.indicators.some((i) => {
        const score = latestScores?.[i.key];
        return typeof score === "number" && score > 0 && score < 5;
      })
    )
    .map((g) => g.id);
  if (ids.length > 0) return ids;
  return groups[0] ? [groups[0].id] : [];
}
