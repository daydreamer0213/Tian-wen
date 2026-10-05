/** Stop this batch's research and withdraw its methods while original services still
 * accept work. This is an operator shutdown owner, not a Runtime policy.
 * parent must be a same-scope native root prepared before shutdown, without a
 * followup or the aborted batch signal. Keep it available rather than relying
 * on root creation during shutdown. The original Loop owns the rollback.
 */
export function installDevelopmentNativeAnalysisShutdown(ctx, { controller, priorStudyIds, parent, onSettled }) {
  const prior = new Set(priorStudyIds)
  let pending
  const withdraw = async () => {
    controller.abort(new Error('Original batch is shutting down'))
    const evolution = ctx.tianwenEvolution
    const ownedActive = () => evolution.listConversationGuidanceStudies()
      .filter(study => !prior.has(study.opened.studyId) && study.activation !== undefined && study.rollback === undefined)
    const ids = ownedActive().map(study => study.opened.studyId)
    try {
      // Stop the Loop's own controllers even if its last review has not written
      // an activation yet. Aborting the operator alone cannot stop that work.
      const consent = evolution.getLearningAnalysisConsent()
      if (consent?.enabled !== false || consent.policyVersion !== 'tianwen-auto-analysis.v3') {
        evolution.recordLearningAnalysisConsent({ enabled: false, revision: (consent?.revision ?? 0) + 1, policyVersion: 'tianwen-auto-analysis.v3' })
      }
      // A consent event alone cannot wake a lane whose last root was released.
      await ctx.tianwenConversationGuidanceLoop.schedule(parent.agent)
      await ctx.tianwenConversationGuidanceLoop.whenIdle()
      if (ownedActive().length > 0) throw new Error('Original shutdown has not withdrawn this batch\'s activated guidance')
      for (const id of ids) {
        const study = evolution.listConversationGuidanceStudies().find(item => item.opened.studyId === id)
        if (study?.rollback?.reason !== 'consent-disabled') throw new Error('Original shutdown rollback was not consent-disabled')
      }
      await onSettled?.({ ownedActiveBefore: ids, ownedActiveAfter: ownedActive().map(study => study.opened.studyId), withdrawalRequired: ids.length > 0 })
    } finally { await parent.dispose() }
  }
  return ctx.on('app/before-exit', () => pending ??= withdraw())
}
