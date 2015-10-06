'use strict';

let cli          = require('heroku-cli-util');
let disambiguate = require('../../lib/disambiguate');
let co           = require('co');
var bluebird     = require('bluebird');

const PROMOTION_ORDER = ['development', 'staging', 'production'];
const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

module.exports = {
  topic: 'pipelines',
  command: 'diff',
  description: 'TODO',
  help: 'TODO',
  needsAuth: true,
  needsApp: true,
  run: cli.command(function* (context, heroku) {

    // TODO: Move something else.
    function *getLatestCommitHash(appId) {
      const release = yield heroku.request({
        method: 'GET',
        path: `/apps/${appId}/releases`,
        headers: { 'Accept': V3_HEADER, 'Range': 'version ..; order=desc,max=1' },
        partial: true
      });
      const slug = yield heroku.request({
        method: 'GET',
        path: `/apps/${appId}/slugs/${release[0].slug.id}`,
        headers: { 'Accept': V3_HEADER }
      });
      return slug.commit;
    }

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

    if (targetStage === null || PROMOTION_ORDER.indexOf(sourceStage) < 0) {
      throw new Error(`Unable to diff ${app}`);
    }

    const downstreamApps = allApps.filter(function(app) {
      return app.coupling.stage === targetStage;
    });

    if (downstreamApps.length < 1) {
      throw new Error(`Cannot diff ${app} as there are no downstream apps configured`);
    }
    // TODO: What if downstreamApps.length > 1?

    const wrappedGetLatestCommitHash = co.wrap(getLatestCommitHash);
    const commitHashes = yield cli.action(`Waiting for stuff?`, bluebird.all([
      wrappedGetLatestCommitHash(downstreamApps[0].id),
      wrappedGetLatestCommitHash(app)
    ]));
    console.log(commitHashes);
  })
};
