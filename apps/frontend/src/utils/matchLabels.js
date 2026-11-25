// Names for what a fixture is: an organizer's own label wins, otherwise the stage it belongs to.
const STAGE_NAMES = { quarter: 'Quarter-final', semi: 'Semi-final', final: 'Final', extra: 'Friendly' };

export function stageLabel(match) {
  if (!match) return '';
  if (match.label) return match.label;
  if (match.stage === 'group') return match.group_name ? `Group ${match.group_name}` : 'Group stage';
  return STAGE_NAMES[match.stage] || '';
}
