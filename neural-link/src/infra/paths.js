/**
 * Centralized path management for Neural Link.
 * 
 * All paths under ~/.copilot/neural-link/ (or custom NEURAL_LINK_HOME)
 * are defined here to prevent duplication and enable environment overrides.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE = process.env.NEURAL_LINK_HOME ?? join(homedir(), '.copilot', 'neural-link');

export const PATHS = {
  BASE,
  WEIGHTS: join(BASE, 'weights'),
  LOGS: join(BASE, 'logs'),
  DEBUG: join(BASE, 'debug'),
};

export const FILES = {
  LEARNED_WEIGHTS: join(PATHS.WEIGHTS, 'learned.json'),
  BACKUP_WEIGHTS: join(PATHS.WEIGHTS, 'learned.backup.json'),
};

export const COPILOT = {
  HOOKS_SCRIPTS: join(homedir(), '.copilot', 'hooks', 'scripts'),
};
