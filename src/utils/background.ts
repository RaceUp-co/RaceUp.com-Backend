import type { Context } from 'hono';
import type { AppType } from '../types';

/**
 * Lance une tache apres la reponse HTTP (`executionCtx.waitUntil`).
 *
 * Sert aux emails : le client ne doit pas attendre 300 ms de plus pour recevoir son
 * « compte cree » parce que Resend repond lentement. Le Worker, lui, reste vivant
 * jusqu'a la fin de la tache — contrairement a une promesse simplement abandonnee,
 * qui serait tuee avec l'isolat.
 *
 * `waitUntil` n'existe pas dans tous les contextes (tests unitaires, certains
 * runtimes) : on retombe alors sur une promesse detachee. Les fonctions de
 * notification capturant deja leurs erreurs, rien ne peut remonter ici.
 */
export function background(c: Context<AppType>, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task.catch(() => {});
  }
}
