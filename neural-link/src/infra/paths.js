/**
 * Centralized path management for Neural Link.
 *
 * All paths under ~/.copilot/neural-link/ (or custom NEURAL_LINK_HOME)
 * are defined here to prevent duplication and enable environment overrides.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Raiz da configuração do Copilot.
 *
 * `COPILOT_HOME` é a variável que o PRÓPRIO host honra para mover toda a configuração —
 * é assim que se levanta um CLI isolado sem encostar na instalação real. O dispatcher
 * precisa seguir o host: apontado para um sandbox, ele tem de descobrir os hooks DAQUELE
 * sandbox. Derivar de `homedir()` sempre, como estava, fazia o dispatcher registrar os
 * hooks da máquina real mesmo rodando num ambiente isolado — o teste "isolado" media a
 * máquina de quem o rodava, e por isso passava num lugar e falhava no outro.
 *
 * Variável VAZIA conta como ausente. `??` sozinho não basta: `''` não é nullish, e uma
 * exportação vazia (comum ao limpar o ambiente de um filho) resolveria a raiz para string
 * vazia — todos os caminhos virariam relativos ao cwd, silenciosamente.
 */
function doAmbiente(nome) {
  const v = process.env[nome];
  return typeof v === 'string' && v.trim() ? v : null;
}

const COPILOT_ROOT = doAmbiente('COPILOT_HOME') ?? join(homedir(), '.copilot');

const BASE = doAmbiente('NEURAL_LINK_HOME') ?? join(COPILOT_ROOT, 'neural-link');

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
  ROOT: COPILOT_ROOT,
  HOOKS_SCRIPTS: join(COPILOT_ROOT, 'hooks', 'scripts'),
  HOOKS: join(COPILOT_ROOT, 'hooks'),
  // Extensões instaladas. Cada uma pode trazer a própria calibragem (`*.neural-link.json`)
  // em vez de declarar hook próprio — declaração própria é o que multiplica processo.
  EXTENSIONS: join(COPILOT_ROOT, 'extensions'),
};
