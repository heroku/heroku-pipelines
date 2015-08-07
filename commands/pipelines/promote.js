'use strict';

let cli = require('heroku-cli-util');

const PROMOTION_ORDER = ["development", "staging", "production"];
const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

module.exports = {
  topic: 'pipelines',
  command: 'promote',
  description: "promote an app's slug down the pipeline",
  help: "promote an app's slug down the pipeline",
  needsApp: true,
  needsAuth: true,
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
    const targetStage = PROMOTION_ORDER[PROMOTION_ORDER.indexOf(sourceStage) + 1];

    if (targetStage == null) {
      throw new Error(`Cannot promote ${app} from '${sourceStage}' stage`);
    }

    const targetApps = allApps.filter(function(app) {
      return app.coupling.stage === targetStage;
    });

    const releases = yield cli.action(`Fetching latest release from ${app}`,
      heroku.apps(app).releases().list({
        headers: {
          'Accept': V3_HEADER,
          'Range':  'version ..; order=desc'
        }
      }));

    const sourceRelease = releases.sort(function(a, b) {
      if (a.version < b.version) return 1;
      if (a.version > b.version) return -1;
      return 0;
    }).filter(function(release) {
      return release.slug != null;
    })[0];

    if (sourceRelease == null) {
      throw new Error(`Cannot promote from ${app} as it has no existing release`);
    }

    const sourceSlug = sourceRelease.slug.id;

    yield targetApps.map(function(targetApp) {
      const promotion = heroku.apps(targetApp.id).releases().create({
        slug: sourceSlug
      });

      return cli.action(`Promoting to ${targetApp.name}`, promotion);
    });
  })
};
