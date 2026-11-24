/** Copy text; if the browser refuses, show it in a dialog to copy by hand. */
import { ManualCopy } from './components/ManualCopy';
import { openDialog, toast } from './uiStore';

export async function copyText(text: string, okMessage = 'הועתק'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    openDialog(<ManualCopy text={text} />);
  }
}
