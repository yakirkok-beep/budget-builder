/**
 * The built-in starting template: data/seed-demo.json, validated through migrate().
 *
 * It is an example with the real structure but made-up numbers (scripts/make-demo.mjs), because
 * the site and the repository are public. The department's real template is a private JSON file
 * (private/seed-2027.json) that users load with "טעינת JSON".
 */

import seedJson from '../../data/seed-demo.json';
import { migrate } from './migrate';
import { clone } from './templates';
import type { Budget } from './types';

const SEED: Budget = migrate(seedJson);

/** A fresh deep copy of the built-in template. */
export const loadSeed = (): Budget => clone(SEED);
