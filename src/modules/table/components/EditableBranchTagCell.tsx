import { normalizeBranchList } from '@/lib/branchUtils';
import { EditableTagsCell } from './EditableTagsCell';

interface EditableBranchTagCellProps {
  value: string[];
  options: string[];
  columnName: string;
  onChange: (v: string[]) => void;
  onAddOption?: (label: string) => void;
  onRenameOption?: (from: string, to: string) => void;
  onDeleteOption?: (label: string) => void;
  onMergeOption?: (left: string, right: string, keep: string) => void;
}

export function EditableBranchTagCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
  onMergeOption,
}: EditableBranchTagCellProps) {
  return (
    <EditableTagsCell
      value={normalizeBranchList(value)}
      options={normalizeBranchList(options)}
      columnName={columnName}
      onChange={(next) => onChange(normalizeBranchList(next))}
      onAddOption={onAddOption}
      onRenameOption={onRenameOption}
      onDeleteOption={onDeleteOption}
      onMergeOption={onMergeOption}
    />
  );
}
