/** Top bar (like the portal's .ez-topbar): budget name, save status, undo/redo, budgets, Excel. */
import { STATUS_TEXT, budgetStore, useBudgetStore, type SaveStatus } from '../../store';
import { exportExcel, switchBudget } from '../actions';
import { Kit } from '../components/Kit';
import { TextInput } from '../components/inputs';
import { undoRedo } from '../undo';
import { openDialog } from '../uiStore';
import { NewBudgetDialog } from '../views/NewBudgetDialog';

const STATUS_CLASS: Record<SaveStatus, string> = { loading: 'busy', dirty: 'busy', saving: 'busy', saved: 'ok', error: 'err' };

const BUDGET_NAME_ID = 'budget-name'; // the data screen focuses it for renaming

function UndoButtons() {
  const canUndo = useBudgetStore((s) => s.canUndo);
  const canRedo = useBudgetStore((s) => s.canRedo);
  return (
    <>
      <button className="btn small ghost" disabled={!canUndo} title="בטל (Ctrl+Z)" aria-keyshortcuts="Control+Z" data-testid="undo" onClick={() => undoRedo('undo')}>
        בטל
      </button>
      <button className="btn small ghost" disabled={!canRedo} title="בצע שוב (Ctrl+Y)" aria-keyshortcuts="Control+Y" data-testid="redo" onClick={() => undoRedo('redo')}>
        בצע שוב
      </button>
    </>
  );
}

function BudgetSwitcher() {
  const budgets = useBudgetStore((s) => s.budgets);
  const currentId = useBudgetStore((s) => s.budgetId);
  const currentName = useBudgetStore((s) => s.budget?.name ?? '');
  if (!currentId) return null;
  const list = budgets.some((b) => b.id === currentId) ? budgets : [{ id: currentId, name: currentName, updatedAt: 0 }, ...budgets];
  return (
    <select className="budgets" value={currentId} aria-label="תקציבים שמורים" data-testid="budget-select" onChange={(e) => void switchBudget(e.target.value)}>
      {list.map((b) => (
        <option key={b.id} value={b.id}>
          {b.id === currentId ? currentName || 'תקציב ללא שם' : b.name || 'תקציב ללא שם'}
        </option>
      ))}
    </select>
  );
}

export function Header() {
  const name = useBudgetStore((s) => s.budget?.name ?? '');
  const loaded = useBudgetStore((s) => s.budget !== null);
  const status = useBudgetStore((s) => s.status);
  const storageError = useBudgetStore((s) => s.storageError);
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <small>בונה תקציב · מחלקת ההדרכה</small>
          <TextInput id={BUDGET_NAME_ID} className="budget-name" value={name} label="שם התקציב" onChange={(v) => budgetStore.getState().setBudgetName(v)} />
        </div>
        <div className={`status ${STATUS_CLASS[status]}`} role="status" aria-live="polite" data-testid="save-status">
          <i aria-hidden="true" />
          <span>{STATUS_TEXT[status]}</span>
        </div>
        {loaded && (
          <div className="top-actions">
            <UndoButtons />
            <BudgetSwitcher />
            <button className="btn small" onClick={() => openDialog(<NewBudgetDialog />)}>
              <Kit name="newBudget" />
              תקציב חדש
            </button>
            <button className="btn small primary" data-testid="export-xlsx" onClick={() => void exportExcel()}>
              <Kit name="excel" />
              ייצוא ל-Excel
            </button>
          </div>
        )}
      </header>
      {storageError && (
        <p className="banner" role="alert">
          {storageError}
        </p>
      )}
    </>
  );
}
