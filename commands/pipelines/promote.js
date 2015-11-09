'use strict';

const cli = require('heroku-cli-util');
const BBPromise = require('bluebird');

const PROMOTION_ORDER = ["development", "staging", "production"];
const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

function isComplete(promotionTarget) {
  return promotionTarget.status !== 'pending';
}

function isSucceeded(promotionTarget) {
  return promotionTarget.status === 'succeeded';
}

function isFailed(promotionTarget) {
  return promotionTarget.status === 'failed';
}

function pollPromotionStatus(heroku, id) {
  return heroku.request({
    method: 'GET',
    path: `/pipeline-promotions/${id}/promotion-targets`,
    headers: { 'Accept': PIPELINES_HEADER, }
  }).then(function(targets) {
    if (targets.every(isComplete)) { return targets; }

    return BBPromise.delay(1000).then(pollPromotionStatus.bind(null, heroku, id));
  });
}

module.exports = {
  topic: 'pipelines',
  command: 'promote',
  description: "promote the latest release of this app to its downstream app(s)",
  help: "Promote the latest release of this app to its downstream app(s).\n\nExample:\n  $ heroku pipelines:promote -a example-staging\n  Promoting example-staging to example (production)... done, v23\n  Promoting example-staging to example-admin (production)... done, v54\n\nExample:\n  $ heroku pipelines:promote -a example-staging --to my-production-app1,my-production-app2\n  Starting promotion to apps: my-production-app1,my-production-app2... done\n  Waiting for promotion to complete... done\n  Promotion successful\n  my-production-app1: succeeded\n  my-production-app2: succeeded",
  needsApp: true,
  needsAuth: true,
  flags: [
    {name: 'to', char: 't', description: 'comma separated list of apps to promote to', hasValue: true}
  ],
  run: cli.command(function* (context, heroku) {
    const app = context.app;

    const coupling = yield cli.action(`Fetching app info`, heroku.request({
      method: 'GET',
      path: `/apps/${app}/pipeline-couplings`,
      headers: { 'Accept': PIPELINES_HEADER }
    }));

    const allApps = yield cli.action(`Fetching apps from ${coupling.pipeline.name}`,
      heroku.request({
        method: 'GET',
        path: `/pipelines/${coupling.pipeline.id}/apps`,
        headers: { 'Accept': PIPELINES_HEADER }
      }));

    const sourceStage = coupling.stage;

    let promotionActionName = '';
    let targetApps = [];
    if (context.flags.to){
      // The user specified a specific set of apps they want to target
      // We don't have to infer the apps or the stage they want to promote to

      let targetAppNames = context.flags.to.split(',').filter((appName)=>{
        // Strip out any empty app names due to something like a trailing comma
        return appName.length >= 1;
      });

      // Now let's make sure that we can find every target app they specified
      // The only requirement is that the app be in this pipeline. They can be at any stage.
      targetApps = targetAppNames.map((targetAppName)=>{
        console.log(`target app name: ${targetAppName} and source app name ${app}`);
        if (targetAppName === app){
          throw new Error(`Cannot promote from an app to itself: ${targetAppName}. Specify a different target app.`);
        }
        let retVal = allApps.find((app)=>{
          return (app.name === targetAppName);
        });
        if (!retVal){
          throw new Error(`Cannot find app ${targetAppName}`);
        }
        return retVal;
      });

      if (targetApps.length < 1) {
        // I don't believe this is possible due to above checkes, but it's similar to the check done below, and is safer
        throw new Error(`You must specify an app to promote to if using -t`);
      }

      promotionActionName = `Starting promotion to apps: ${targetAppNames.toString()}`;

    } else {
      const targetStage = PROMOTION_ORDER[PROMOTION_ORDER.indexOf(sourceStage) + 1];

      if (targetStage === null || PROMOTION_ORDER.indexOf(sourceStage) < 0) {
        throw new Error(`Cannot promote ${app} from '${sourceStage}' stage`);
      }

      targetApps = allApps.filter(function(app) {
        return app.coupling.stage === targetStage;
      });

      if (targetApps.length < 1) {
        throw new Error(`Cannot promote from ${app} as there are no downstream apps in ${targetStage} stage`);
      }

      promotionActionName = `Starting promotion to ${targetStage}`;
    }

    const promotion = yield cli.action(promotionActionName, heroku.request({
      method: 'POST',
      path: `/pipeline-promotions`,
      headers: { 'Accept': PIPELINES_HEADER, },
      body: {
        pipeline: { id: coupling.pipeline.id },
        source:   { app: { id: coupling.app.id } },
        targets:  targetApps.map(function(app) { return { app: { id: app.id } }; })
      }
    }));

    const pollLoop = pollPromotionStatus(heroku, promotion.id);
    const promotionTargets = yield cli.action('Waiting for promotion to complete', pollLoop);


    const appsByID = allApps.reduce(function(memo, app) {
      memo[app.id] = app;
      return memo;
    }, {});

    const styledTargets = promotionTargets.reduce(function(memo, target) {
      const app = appsByID[target.app.id];
      const details = [target.status];

      if (isFailed(target)) { details.push(target.error_message); }

      memo[app.name] = details;
      return memo;
    }, {});

    if (promotionTargets.every(isSucceeded)) {
      cli.log('\nPromotion successful');
    } else {
      cli.warn('\nPromotion to some apps failed');
    }

    cli.styledHash(styledTargets);
  })
};
