import { KIT, type KitName } from '../kit';

/** A kit icon. Decorative: the text next to it carries the meaning. */
export function Kit({ name, className = '' }: { name: KitName; className?: string }) {
  return <img className={`kit ${className}`} src={KIT[name]} alt="" aria-hidden="true" />;
}
