/**
 * Icons from the staff portal's kit (team-portal assets/kit), bundled by Vite so their URLs
 * work under any base path (GitHub Pages sub-folder, offline PWA cache).
 */
const files = import.meta.glob<string>('../assets/kit/*.png', { eager: true, import: 'default', query: '?url' });

const url = (name: string): string => {
  const hit = Object.entries(files).find(([path]) => path.endsWith('/' + name + '.png'));
  if (!hit) throw new Error('missing kit icon ' + name);
  return hit[1];
};

/** What each icon stands for in this tool. */
export const KIT = {
  logo: url('logo-tagline'),
  summary: url('mgmt-1-3'),
  events: url('dash-4-4'),
  addEvent: url('dash-2-2'),
  params: url('mgmt-6-1'),
  salary: url('bus-5-2'),
  priority: url('mgmt-x2'),
  data: url('dash-2-1'),
  excel: url('bus-7-1'),
  newBudget: url('edit-1-2'),
  expenses: url('bus-2-3'),
  income: url('dash-4-2'),
  deficit: url('mgmt-6-2'),
  change: url('bus-3-2'),
} as const;

export type KitName = keyof typeof KIT;
